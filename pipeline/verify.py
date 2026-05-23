import os
import json
import pandas as pd

def run_verification():
    print("==================================================")
    print("Starting Automated Dataset Verification")
    print("==================================================")
    
    success = True
    
    # 1. Check Master Files existence and size
    print("Checking master files...")
    csv_path = "india_engineering_colleges.csv"
    xlsx_path = "india_engineering_colleges.xlsx"
    json_path = "colleges_db.json"
    
    if os.path.exists(csv_path):
        size_mb = os.path.getsize(csv_path) / (1024 * 1024)
        print(f"  [PASS] {csv_path} exists ({size_mb:.2f} MB)")
    else:
        print(f"  [FAIL] {csv_path} is missing!")
        success = False
        
    if os.path.exists(xlsx_path):
        size_mb = os.path.getsize(xlsx_path) / (1024 * 1024)
        print(f"  [PASS] {xlsx_path} exists ({size_mb:.2f} MB)")
    else:
        print(f"  [FAIL] {xlsx_path} is missing!")
        success = False
        
    if os.path.exists(json_path):
        size_mb = os.path.getsize(json_path) / (1024 * 1024)
        print(f"  [PASS] {json_path} exists ({size_mb:.2f} MB)")
    else:
        print(f"  [FAIL] {json_path} is missing!")
        success = False
        
    # 2. Schema Validation
    if os.path.exists(csv_path):
        print("\nValidating master CSV schema...")
        df = pd.read_csv(csv_path)
        print(f"  Total records loaded: {len(df)}")
        
        required_cols = [
            "College ID", "AICTE Institute ID", "UGC University ID", "College Name",
            "College Status", "State", "District", "City", "Full Address", "Pincode",
            "Latitude", "Longitude", "College Type", "Affiliated University",
            "AICTE Approval Status", "UGC Approval Status", "NAAC Grade", "NBA Accreditation",
            "NIRF Ranking", "Tier Classification", "Official Website", "Official College Email",
            "Admission Email", "Placement Cell Email", "Contact Phone Number",
            "Engineering Branch Name", "Degree Type", "Branch Intake Capacity",
            "Total Intake Capacity", "Establishment Year", "Campus Type", "Hostel Available",
            "Placement Available"
        ]
        
        missing_cols = [c for c in required_cols if c not in df.columns]
        if not missing_cols:
            print("  [PASS] All 33 required columns are present in CSV.")
        else:
            print(f"  [FAIL] Missing columns in CSV: {missing_cols}")
            success = False
            
        # Check coordinates and pincodes formatting
        nan_lat = df["Latitude"].isna().sum()
        nan_lon = df["Longitude"].isna().sum()
        nan_pin = df["Pincode"].isna().sum()
        
        if nan_lat == 0 and nan_lon == 0:
            print("  [PASS] No missing coordinates in the dataset.")
        else:
            print(f"  [FAIL] Found {nan_lat} missing Latitudes and {nan_lon} Longitudes.")
            success = False
            
        if nan_pin == 0:
            print("  [PASS] No missing Pincodes in the dataset.")
        else:
            print(f"  [FAIL] Found {nan_pin} missing Pincodes.")
            success = False
            
        # Check branch records uniqueness per college
        duplicates = df.duplicated(subset=["College ID", "Engineering Branch Name", "Degree Type"]).sum()
        if duplicates == 0:
            print("  [PASS] No duplicate branch records per college in CSV.")
        else:
            print(f"  [FAIL] Found {duplicates} duplicate branch records in the CSV!")
            success = False
            
    # 3. Check State-wise & District-wise Folder Integrity
    print("\nValidating partitions...")
    states_dir = "states"
    districts_dir = "districts"
    
    if os.path.exists(states_dir) and os.path.isdir(states_dir):
        state_files = [f for f in os.listdir(states_dir) if f.endswith(".csv")]
        print(f"  [PASS] {states_dir}/ directory contains {len(state_files)} state CSV files.")
        if len(state_files) > 0:
            # Check a sample file formatting
            sample_path = os.path.join(states_dir, state_files[0])
            sample_df = pd.read_csv(sample_path)
            if not sample_df.empty:
                print(f"  [PASS] State partition sample ({state_files[0]}) is valid and loaded successfully.")
            else:
                print(f"  [FAIL] State partition sample ({state_files[0]}) is empty!")
                success = False
    else:
        print("  [FAIL] states/ directory is missing!")
        success = False
        
    if os.path.exists(districts_dir) and os.path.isdir(districts_dir):
        dist_files = [f for f in os.listdir(districts_dir) if f.endswith(".csv")]
        print(f"  [PASS] {districts_dir}/ directory contains {len(dist_files)} district CSV files.")
    else:
        print("  [FAIL] districts/ directory is missing!")
        success = False
        
    # 4. JSON Schema check
    if os.path.exists(json_path):
        print("\nValidating dashboard JSON structure...")
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                json_data = json.load(f)
                print(f"  Total colleges in JSON: {len(json_data)}")
                if len(json_data) > 0:
                    sample = json_data[0]
                    if "branches" in sample and isinstance(sample["branches"], list):
                        print("  [PASS] JSON contains nested branches structure successfully.")
                    else:
                        print("  [FAIL] JSON structure has missing or incorrect branches key!")
                        success = False
        except Exception as e:
            print(f"  [FAIL] Failed to load or validate JSON: {e}")
            success = False
            
    print("\n==================================================")
    if success:
        print("Verification Result: ALL CHECKS PASSED SUCCESSFUL!")
    else:
        print("Verification Result: SOME CHECKS FAILED! PLEASE REVIEW LOGS.")
    print("==================================================")

if __name__ == "__main__":
    run_verification()
