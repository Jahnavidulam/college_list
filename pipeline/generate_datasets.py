import os
import requests
import json
import re
import pandas as pd
from clean import clean_state_name, clean_district_name, clean_branch_name, clean_degree_type
from enrich import enrich_college_row

SOURCE_URL = "https://raw.githubusercontent.com/anburocky3/indian-colleges-data/master/data/institutions-with-programmes.json"

def run_pipeline():
    print("--------------------------------------------------")
    print("Starting Indian Engineering Colleges Data Pipeline")
    print("--------------------------------------------------")
    
    # 1. Ensure output directories exist
    os.makedirs("states", exist_ok=True)
    os.makedirs("districts", exist_ok=True)
    os.makedirs("pipeline", exist_ok=True)
    
    # 2. Download raw dataset
    print(f"Downloading source data from: {SOURCE_URL}")
    response = requests.get(SOURCE_URL)
    if response.status_code != 200:
        print("Error: Failed to download source dataset!")
        return
        
    raw_data = response.json()
    print(f"Successfully downloaded {len(raw_data)} total college records.")
    
    # 3. Filter and parse Engineering & Technology colleges
    print("Filtering and processing Engineering & Technology colleges...")
    college_branch_records = []
    unique_colleges = {} # Store colleges by ID to compute total intakes and nested JSON structure
    
    for idx, col in enumerate(raw_data):
        # We search if the college offers "ENGINEERING AND TECHNOLOGY"
        programmes = col.get("programmes", [])
        engg_programmes = [p for p in programmes if "ENGINEERING" in str(p.get("programme", "")).upper()]
        
        if not engg_programmes:
            continue # Skip non-engineering colleges
            
        # Clean basic parameters
        aicte_id = col.get("aicte_id")
        if not aicte_id or aicte_id == "Unknown":
            aicte_id = f"AICTE-{100000 + idx}"
            
        name = col.get("institute_name", "").upper().strip()
        state = clean_state_name(col.get("state", "Unknown"))
        district = clean_district_name(col.get("district", "Unknown"))
        address = col.get("address", "Unknown Address")
        inst_type = col.get("institution_type", "Private")
        uni = col.get("university", "Affiliated University")
        
        # Prepare college base dictionary
        college_base = {
            "aicte_id": aicte_id,
            "institute_name": name,
            "state": state,
            "district": district,
            "address": address,
            "institution_type": inst_type,
            "university": uni
        }
        
        # Enrich basic information
        enriched_base = enrich_college_row(college_base)
        
        # Process individual engineering courses/branches
        college_branches = []
        for p in engg_programmes:
            raw_branch_name = p.get("course", "")
            if not raw_branch_name:
                continue
                
            branch_name = clean_branch_name(raw_branch_name)
            degree = clean_degree_type(p.get("level", ""))
            
            try:
                intake = int(p.get("intake", 0))
            except:
                intake = 0
                
            college_branches.append({
                "branch_name": branch_name,
                "degree_type": degree,
                "branch_intake": intake
            })
            
        if not college_branches:
            continue # Skip if no valid branches found
            
        # Deduplicate courses inside the same college
        # (AICTE might report multiple shifts or divisions, we aggregate their intakes)
        deduped_branches = {}
        for b in college_branches:
            key = (b["branch_name"], b["degree_type"])
            if key in deduped_branches:
                deduped_branches[key]["branch_intake"] += b["branch_intake"]
            else:
                deduped_branches[key] = b
                
        college_branches_list = list(deduped_branches.values())
        
        # Compute Total Engineering Intake for the college
        total_intake = sum(b["branch_intake"] for b in college_branches_list)
        
        # Store in unique colleges dictionary for compact JSON export
        unique_colleges[aicte_id] = {
            "college_id": aicte_id,
            "aicte_id": aicte_id,
            "ugc_id": enriched_base["ugc_id"],
            "college_name": enriched_base["institute_name"],
            "status": enriched_base["college_status"],
            "state": enriched_base["state"],
            "district": enriched_base["district"],
            "city": enriched_base["city"],
            "address": enriched_base["address"],
            "pincode": enriched_base["pincode"],
            "latitude": enriched_base["latitude"],
            "longitude": enriched_base["longitude"],
            "type": enriched_base["college_type"],
            "affiliated_university": enriched_base["university"],
            "aicte_status": enriched_base["aicte_status"],
            "ugc_status": enriched_base["ugc_status"],
            "naac_grade": enriched_base["naac_grade"],
            "nba_accreditation": enriched_base["nba_acc"],
            "nirf_rank": enriched_base["nirf_rank"],
            "tier": enriched_base["tier"],
            "website": enriched_base["website"],
            "email": enriched_base["email"],
            "admission_email": enriched_base["admission_email"],
            "placement_email": enriched_base["placement_email"],
            "phone": enriched_base["phone"],
            "est_year": enriched_base["est_year"],
            "campus_type": enriched_base["campus_type"],
            "hostel_available": enriched_base["hostel"],
            "placement_cell": enriched_base["placement_cell"],
            "total_intake": total_intake,
            "branches": college_branches_list
        }
        
        # Flatten into separate branch rows for CSV/Excel relational output
        for b in college_branches_list:
            college_branch_records.append({
                "College ID": aicte_id,
                "AICTE Institute ID": aicte_id,
                "UGC University ID": enriched_base["ugc_id"],
                "College Name": enriched_base["institute_name"],
                "College Status": enriched_base["college_status"],
                "State": enriched_base["state"],
                "District": enriched_base["district"],
                "City": enriched_base["city"],
                "Full Address": enriched_base["address"],
                "Pincode": enriched_base["pincode"],
                "Latitude": enriched_base["latitude"],
                "Longitude": enriched_base["longitude"],
                "College Type": enriched_base["college_type"],
                "Affiliated University": enriched_base["university"],
                "AICTE Approval Status": enriched_base["aicte_status"],
                "UGC Approval Status": enriched_base["ugc_status"],
                "NAAC Grade": enriched_base["naac_grade"],
                "NBA Accreditation": enriched_base["nba_acc"],
                "NIRF Ranking": enriched_base["nirf_rank"],
                "Tier Classification": enriched_base["tier"],
                "Official Website": enriched_base["website"],
                "Official College Email": enriched_base["email"],
                "Admission Email": enriched_base["admission_email"],
                "Placement Cell Email": enriched_base["placement_email"],
                "Contact Phone Number": enriched_base["phone"],
                "Engineering Branch Name": b["branch_name"],
                "Degree Type": b["degree_type"],
                "Branch Intake Capacity": b["branch_intake"],
                "Total Intake Capacity": total_intake,
                "Establishment Year": enriched_base["est_year"],
                "Campus Type": enriched_base["campus_type"],
                "Hostel Available": enriched_base["hostel"],
                "Placement Available": enriched_base["placement_cell"]
            })
            
    print(f"Processed {len(unique_colleges)} unique colleges yielding {len(college_branch_records)} branch records.")
    
    # 4. Generate Master DataFrame
    df = pd.DataFrame(college_branch_records)
    
    # 5. Export Master CSV & XLSX
    print("Writing master CSV file (india_engineering_colleges.csv)...")
    df.to_csv("india_engineering_colleges.csv", index=False, encoding="utf-8")
    
    print("Writing master Excel file (india_engineering_colleges.xlsx)...")
    # Using openpyxl to write the Excel sheet
    df.to_excel("india_engineering_colleges.xlsx", index=False, sheet_name="Colleges")
    
    # 6. Export State-wise files
    print("Exporting state-wise datasets...")
    states_count = 0
    for state_name, state_df in df.groupby("State"):
        # Format filename: lower_case_with_underscores
        clean_name = re.sub(r'[^a-z0-9]', '_', str(state_name).lower())
        clean_name = re.sub(r'_+', '_', clean_name).strip('_')
        filepath = os.path.join("states", f"{clean_name}_engineering_colleges.csv")
        state_df.to_csv(filepath, index=False, encoding="utf-8")
        states_count += 1
        
    print(f"Successfully generated {states_count} state-specific CSV files.")
    
    # 7. Export District-wise files
    print("Exporting district-wise datasets...")
    districts_count = 0
    # Group by district, but make sure the district name is clean for the filename
    for district_name, dist_df in df.groupby("District"):
        clean_name = re.sub(r'[^a-z0-9]', '_', str(district_name).lower())
        clean_name = re.sub(r'_+', '_', clean_name).strip('_')
        if not clean_name:
            continue
        filepath = os.path.join("districts", f"{clean_name}_engineering_colleges.csv")
        dist_df.to_csv(filepath, index=False, encoding="utf-8")
        districts_count += 1
        
    print(f"Successfully generated {districts_count} district-specific CSV files.")
    
    # 8. Export Search-Optimized JSON for the Web Dashboard
    print("Writing search-optimized JSON database (colleges_db.json)...")
    json_filepath = "colleges_db.json"
    with open(json_filepath, "w", encoding="utf-8") as f:
        json.dump(list(unique_colleges.values()), f, ensure_ascii=False, indent=2)
        
    print("--------------------------------------------------")
    print("Data Pipeline Completed Successfully!")
    print("--------------------------------------------------")

if __name__ == "__main__":
    run_pipeline()
