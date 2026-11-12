import pandas as pd
import numpy as np
import random

np.random.seed(42)
random.seed(42)

roles = [
    'Software Engineer', 'Data Analyst', 'Cloud Engineer',
    'DevOps Specialist', 'Business Analyst', 'QA Engineer',
    'UI/UX Designer', 'Product Manager', 'Cybersecurity Specialist', 'AI / ML Engineer'
]
degrees = ["Bachelor's", "Master's", "PhD"]
certs = ['AWS Certified', 'Scrum Master', 'Google Data Analytics', 'PMP', 'React Certified', 'Azure Certified', 'CompTIA Security+', 'TensorFlow Developer', 'None']

first_names = ["Arun", "Karthik", "Ravi", "Manoj", "Senthil", "Vignesh", "Harish", "Prakash", "Suresh", "Vijay", 
               "Balaji", "Ramesh", "Deepak", "Prabhu", "Sundar", "Kumar", "Selvam", "Rajesh", "Aravind", "Anand", 
               "Divya", "Priya", "Ramya", "Sandhya", "Archana", "Kavitha", "Swetha", "Nandhini", "Abirami", "Deepika"]
last_names = ["Ganesan", "Murugan", "Srinivasan", "Venkatesan", "Subramanian", "Mani", "Rajan", "Sekar", "Chandran", "Krishnan", 
              "Raman", "Balakrishnan", "Ramachandran", "Anbarasan", "Kumar", "Selvam", "Babu", "Gopal", "Pandian", "Dinesh"]

num_candidates = 250
candidates = []

for i in range(1, num_candidates + 1):
    cand_id = f"CAND-{1000+i}"
    name = f"{random.choice(first_names)} {random.choice(last_names)}"
    edu = random.choices(degrees, weights=[0.55, 0.35, 0.10])[0]
    exp = max(0, int(np.random.normal(4, 2.5)))
    tech_score = int(np.clip(np.random.normal(70, 15), 35, 99))
    comm_score = int(np.clip(np.random.normal(68, 14), 30, 99))
    apt_score = int(np.clip(np.random.normal(72, 13), 40, 99))
    cert = random.choice(certs)
    
    # Skill presence (binary 1 or 0)
    python = 1 if random.random() < 0.45 else 0
    java = 1 if random.random() < 0.3 else 0
    sql = 1 if random.random() < 0.5 else 0
    powerbi = 1 if random.random() < 0.35 else 0
    excel = 1 if random.random() < 0.6 else 0
    javascript = 1 if random.random() < 0.4 else 0
    cybersecurity = 1 if random.random() < 0.25 else 0
    ml = 1 if random.random() < 0.22 else 0
    
    # Applied Role
    applied_role = random.choice(roles)
    
    selected_role = None
    
    # Rule matching
    if cert == 'TensorFlow Developer' or (ml == 1 and python == 1 and tech_score >= 75):
        selected_role = 'AI / ML Engineer'
    elif cert == 'CompTIA Security+' or (cybersecurity == 1 and tech_score >= 65):
        selected_role = 'Cybersecurity Specialist'
    elif cert == 'Scrum Master' or cert == 'PMP' and comm_score >= 70:
        selected_role = 'Product Manager'
    elif cert == 'Google Data Analytics' or (sql == 1 and powerbi == 1 and apt_score >= 65):
        selected_role = 'Data Analyst'
    elif cert == 'AWS Certified' or cert == 'Azure Certified' and tech_score >= 60:
        selected_role = 'Cloud Engineer'
    elif python == 1 and java == 1 and tech_score >= 70:
        selected_role = 'Software Engineer'
    elif (python == 1 or java == 1) and sql == 1 and tech_score >= 65:
        selected_role = 'QA Engineer'
    elif excel == 1 and sql == 1 and comm_score >= 65:
        selected_role = 'Business Analyst'
    elif python == 1 and tech_score >= 60 and exp >= 2:
        selected_role = 'DevOps Specialist'
    else:
        # Default or fallback
        if apt_score >= 70 and comm_score >= 65:
            selected_role = 'UI/UX Designer'
        else:
            selected_role = random.choice(roles)
            
    # Add 12% random noise to selected_role to simulate real-world data mismatch
    if random.random() < 0.12:
        selected_role = random.choice(roles)
        
    final_status = "Selected" if selected_role == applied_role else "Rejected"
    
    candidates.append({
        'Candidate_ID': cand_id,
        'Candidate_Name': name,
        'Education': edu,
        'Experience': exp,
        'Technical_Score': tech_score,
        'Communication_Score': comm_score,
        'Aptitude_Score': apt_score,
        'Certifications': cert,
        'Python': python,
        'Java': java,
        'SQL': sql,
        'PowerBI': powerbi,
        'Excel': excel,
        'JavaScript': javascript,
        'Cybersecurity': cybersecurity,
        'Machine_Learning': ml,
        'Applied_Role': applied_role,
        'Selected_Role': selected_role,
        'Final_Status': final_status
    })

df = pd.DataFrame(candidates)
df.to_csv("recruitment_dataset.csv", index=False)
print(f"Generated recruitment_dataset.csv with {len(df)} records.")
