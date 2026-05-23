import re

# Standard States mapping to correct capitalisation and normalisation.
STATES_NORMALIZATION = {
    "andaman & nicobar islands": "Andaman and Nicobar Islands",
    "andaman and nicobar islands": "Andaman and Nicobar Islands",
    "andhra pradesh": "Andhra Pradesh",
    "arunachal pradesh": "Arunachal Pradesh",
    "assam": "Assam",
    "bihar": "Bihar",
    "chandigarh": "Chandigarh",
    "chhattisgarh": "Chhattisgarh",
    "dadra & nagar haveli": "Dadra and Nagar Haveli",
    "dadra and nagar haveli": "Dadra and Nagar Haveli",
    "daman & diu": "Daman and Diu",
    "daman and diu": "Daman and Diu",
    "delhi": "Delhi",
    "goa": "Goa",
    "gujarat": "Gujarat",
    "haryana": "Haryana",
    "himachal pradesh": "Himachal Pradesh",
    "jammu & kashmir": "Jammu and Kashmir",
    "jammu and kashmir": "Jammu and Kashmir",
    "jharkhand": "Jharkhand",
    "karnataka": "Karnataka",
    "kerala": "Kerala",
    "ladakh": "Ladakh",
    "lakshadweep": "Lakshadweep",
    "madhya pradesh": "Madhya Pradesh",
    "maharashtra": "Maharashtra",
    "manipur": "Manipur",
    "meghalaya": "Meghalaya",
    "mizoram": "Mizoram",
    "nagaland": "Nagaland",
    "odisha": "Odisha",
    "orissa": "Odisha",
    "puducherry": "Puducherry",
    "punjab": "Punjab",
    "rajasthan": "Rajasthan",
    "sikkim": "Sikkim",
    "tamil nadu": "Tamil Nadu",
    "telangana": "Telangana",
    "tripura": "Tripura",
    "uttarakhand": "Uttarakhand",
    "uttaranchal": "Uttarakhand",
    "uttar pradesh": "Uttar Pradesh",
    "west bengal": "West Bengal"
}

def clean_state_name(state):
    """
    Standardize Indian State/UT names.
    """
    s = str(state).lower().strip()
    return STATES_NORMALIZATION.get(s, str(state).title().strip())

def clean_district_name(district):
    """
    Standardize district names to Title Case, fixing common acronyms/symbols.
    """
    d = str(district).upper().strip()
    
    # Fix specific spelling/naming variations
    replaces = {
        "BANGALORE URBAN": "Bengaluru Urban",
        "BANGALORE RURAL": "Bengaluru Rural",
        "BENGALURU URBAN": "Bengaluru Urban",
        "BENGALURU RURAL": "Bengaluru Rural",
        "BANGALORE": "Bengaluru",
        "BENGALURU": "Bengaluru",
        "TRICHY": "Tiruchirappalli",
        "TIRUCHIRAPALLI": "Tiruchirappalli",
        "TIRUCHIRAPPALLI": "Tiruchirappalli",
        "MYSURU": "Mysuru",
        "MYSORE": "Mysuru",
        "RANGAREDDY": "Rangareddy",
        "RANGA REDDY": "Rangareddy",
        "MEDCHAL MALKAJGIRI": "Medchal Malkajgiri",
        "GUTUR": "Guntur",
        "KADAPA": "YSR Kadapa",
        "YSR KADAPA": "YSR Kadapa",
        "ANANTAPUR": "Anantapur",
        "ANANTHAPURAMU": "Anantapur",
        "ANANTHAPUR": "Anantapur",
        "CHHATRAPATI SAMBHAJINAGAR": "Aurangabad",
        "AURANGABAD": "Aurangabad",
        "KANPUR NAGAR": "Kanpur",
        "KANPUR": "Kanpur",
        "GAUTAM BUDDHA NAGAR": "Gautam Buddha Nagar",
        "NOIDA": "Gautam Buddha Nagar",
    }
    
    if d in replaces:
        return replaces[d]
        
    # Standard Title Case for others
    # Replace symbols like dashes or slashes with spaces
    d_clean = re.sub(r'[-_/]', ' ', d)
    words = d_clean.split()
    title_words = [w.title() for w in words]
    return " ".join(title_words)

def clean_branch_name(course_name):
    """
    Map highly dynamic courses from the AICTE database to standard Engineering Branches.
    """
    c = str(course_name).upper().strip()
    
    # AI & ML
    if "ARTIFICIAL INTELLIGENCE" in c and "MACHINE LEARNING" in c:
        return "Artificial Intelligence & Machine Learning (AI & ML)"
    if "AI" in c and "ML" in c:
        return "Artificial Intelligence & Machine Learning (AI & ML)"
        
    # Data Science
    if "DATA SCIENCE" in c:
        return "Data Science"
        
    # Computer Science Engineering
    if "COMPUTER SCIENCE" in c or "COMPUTER ENG" in c or "CSE" in c or "SOFTWARE ENG" in c:
        if "CYBER" in c or "SECURITY" in c:
            return "Cyber Security"
        if "INTERNET OF THINGS" in c or "IOT" in c:
            return "IoT"
        return "Computer Science Engineering (CSE)"
        
    # Information Technology
    if "INFORMATION TECHNOLOGY" in c or "INFORMATION SCIENCE" in c or "IT" in c:
        return "Information Technology (IT)"
        
    # Electronics & Communication
    if "ELECTRONICS" in c and "COMMUNICATION" in c or "ECE" in c:
        return "Electronics & Communication Engineering (ECE)"
        
    # Electrical & Electronics
    if "ELECTRICAL" in c and "ELECTRONICS" in c:
        return "Electrical & Electronics Engineering (EEE)"
    if "ELECTRICAL" in c:
        return "Electrical Engineering"
        
    # Mechanical Engineering
    if "MECHANICAL" in c or "MECH" in c:
        if "AUTOMOBILE" in c or "AUTOMOTIVE" in c:
            return "Automobile Engineering"
        return "Mechanical Engineering"
        
    # Civil Engineering
    if "CIVIL" in c:
        return "Civil Engineering"
        
    # Chemical Engineering
    if "CHEMICAL" in c:
        return "Chemical Engineering"
        
    # Biotechnology
    if "BIOTECHNOLOGY" in c or "BIO-TECHNOLOGY" in c or "BIO TECHNOLOGY" in c:
        return "Biotechnology"
        
    # Aeronautical
    if "AERONAUTICAL" in c or "AEROSPACE" in c:
        return "Aeronautical Engineering"
        
    # Agricultural
    if "AGRICULTURAL" in c or "AGRICULTURE" in c:
        return "Agricultural Engineering"
        
    # Cyber Security (Standalone)
    if "CYBER" in c or "SECURITY" in c:
        return "Cyber Security"
        
    # IoT (Standalone)
    if "INTERNET OF THINGS" in c or "IOT" in c:
        return "IoT"
        
    # Robotics
    if "ROBOTICS" in c or "AUTOMATION" in c:
        return "Robotics"
        
    # Automobile
    if "AUTOMOBILE" in c or "AUTOMOTIVE" in c:
        return "Automobile Engineering"
        
    # Mechatronics
    if "MECHATRONICS" in c:
        return "Mechatronics"
        
    # Mining
    if "MINING" in c:
        return "Mining Engineering"
        
    # Default to standard other branches
    return "Other Engineering Branches"

def clean_degree_type(level):
    """
    Standardize levels of education to B.Tech, M.Tech, or Diploma.
    """
    l = str(level).upper().strip()
    if "UNDER GRADUATE" in l or "UG" in l or "BACHELOR" in l or "DEGREE" in l:
        return "B.Tech"
    elif "POST GRADUATE" in l or "PG" in l or "MASTER" in l:
        return "M.Tech"
    elif "DIPLOMA" in l or "POST DIPLOMA" in l:
        return "Diploma"
    return "B.Tech" # Default fallback
