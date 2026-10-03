import csv
import random

random.seed(42)
purposes = ["DEBT_CONSOLIDATION", "HOME_IMPROVEMENT", "SMALL_BUSINESS", "EDUCATION", "MAJOR_PURCHASE"]
home_status = ["RENT", "OWN", "MORTGAGE"]

with open("datasets/Loan Data/loan_applications.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow([
        "applicant_age",
        "annual_income",
        "credit_score",
        "loan_amount",
        "interest_rate",
        "loan_term_months",
        "employment_years",
        "home_ownership",
        "loan_purpose",
        "debt_to_income_ratio",
        "loan_status"
    ])
    for i in range(250):
        age = random.randint(22, 68)
        income = round(random.uniform(32000, 150000), 2)
        score = random.randint(560, 840)
        amount = round(random.uniform(5000, 50000), 2)
        term = random.choice([36, 60])
        rate = round(random.uniform(5.5, 18.5), 2)
        emp = random.randint(1, 20)
        home = random.choice(home_status)
        purpose = random.choice(purposes)
        dti = round(random.uniform(0.08, 0.45), 3)
        approved = (score > 660 and dti < 0.38) or (income > 80000 and score > 620)
        status = "APPROVED" if approved else "REJECTED"
        writer.writerow([
            age, income, score, amount, rate, term, emp, home, purpose, dti, status
        ])

print("Wrote 250 rows to datasets/Loan Data/loan_applications.csv")
