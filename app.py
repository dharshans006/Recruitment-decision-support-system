import os
import io
import json
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, render_template, send_from_directory, make_response
from flask_cors import CORS
from sklearn.tree import DecisionTreeClassifier, export_text, _tree
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.preprocessing import LabelEncoder
import joblib

app = Flask(__name__, template_folder='templates', static_folder='static')
CORS(app)

# Create folders if they don't exist
os.makedirs('uploads', exist_ok=True)
os.makedirs('models', exist_ok=True)

# Global in-memory storage for current session data
CURRENT_DATA = {
    'df_raw': None,         # original df loaded
    'df_clean': None,       # preprocessed df
    'model': None,          # sklearn DecisionTreeClassifier
    'features': [
        'Education', 'Experience', 'Technical_Score', 'Communication_Score', 
        'Aptitude_Score', 'Certifications', 'Python', 'Java', 'SQL', 'PowerBI', 'Excel',
        'JavaScript', 'Cybersecurity', 'Machine_Learning'
    ],
    'target_col': 'Selected_Role',
    'label_encoders': {},
    'target_encoder': None,
    'preprocessing_stats': {
        'before': {'rows': 0, 'missing': 0, 'duplicates': 0},
        'after': {'rows': 0, 'missing': 0, 'duplicates': 0}
    },
    'analyzed_candidates': [],
    'alternative_recommendations': []
}

# Helpers
def load_default_dataset():
    if os.path.exists("recruitment_dataset.csv"):
        try:
            df = pd.read_csv("recruitment_dataset.csv")
            if df.columns.duplicated().any():
                cols = pd.Series(df.columns)
                for dup in cols[cols.duplicated()].unique():
                    cols[cols == dup] = [f"{dup}_{i}" if i != 0 else dup for i in range(sum(cols == dup))]
                df.columns = cols
            CURRENT_DATA['df_raw'] = df.copy()
            preprocess_dataset_internally()
            print("Successfully loaded default recruitment dataset.")
        except Exception as e:
            print("Default dataset load warning:", e)

def preprocess_dataset_internally():
    if CURRENT_DATA['df_raw'] is None:
        return
    
    df = CURRENT_DATA['df_raw'].copy()
    
    # Capture before stats
    before_rows = len(df)
    before_missing = int(df.isnull().sum().sum())
    before_duplicates = int(df.duplicated().sum())
    
    CURRENT_DATA['preprocessing_stats']['before'] = {
        'rows': before_rows,
        'missing': before_missing,
        'duplicates': before_duplicates
    }
    
    # 1. Duplicate removal
    df = df.drop_duplicates()
    
    # 2. Missing values handling
    for col in df.columns:
        if np.issubdtype(df[col].dtype, np.number):
            df[col] = df[col].fillna(df[col].median() if len(df[col].dropna()) > 0 else 0)
        else:
            df[col] = df[col].fillna(df[col].mode()[0] if len(df[col].dropna()) > 0 else 'Unknown')
            
    # Capture after stats (before encoding)
    after_rows = len(df)
    after_missing = int(df.isnull().sum().sum())
    after_duplicates = int(df.duplicated().sum())
    
    CURRENT_DATA['preprocessing_stats']['after'] = {
        'rows': after_rows,
        'missing': after_missing,
        'duplicates': after_duplicates
    }
    
    # Save clean dataset
    CURRENT_DATA['df_clean'] = df.copy()
    
    # Auto-train model using the default target column
    train_model_internally()

def train_model_internally():
    if CURRENT_DATA['df_clean'] is None:
        return
        
    df = CURRENT_DATA['df_clean'].copy()
    features = CURRENT_DATA['features']
    target = CURRENT_DATA['target_col']
    
    # Verify features and target are in df
    missing_cols = [c for c in features + [target] if c not in df.columns]
    if missing_cols:
        print(f"Skipping training, missing columns: {missing_cols}")
        return
        
    X = df[features].copy()
    y = df[target].copy()
    
    # Encoders
    label_encoders = {}
    X_encoded = pd.DataFrame()
    
    for col in features:
        if np.issubdtype(X[col].dtype, np.number):
            X_encoded[col] = X[col]
        else:
            le = LabelEncoder()
            X_encoded[col] = le.fit_transform(X[col].astype(str))
            label_encoders[col] = le
            
    target_le = LabelEncoder()
    y_encoded = target_le.fit_transform(y.astype(str))
    
    # Train test split
    X_train, X_test, y_train, y_test = train_test_split(X_encoded, y_encoded, test_size=0.2, random_state=42)
    
    clf = DecisionTreeClassifier(max_depth=2, random_state=42)
    clf.fit(X_train, y_train)
    
    # Save elements
    CURRENT_DATA['model'] = clf
    CURRENT_DATA['label_encoders'] = label_encoders
    CURRENT_DATA['target_encoder'] = target_le
    
    # Save files
    joblib.dump(clf, 'models/decision_tree_model.pkl')
    joblib.dump(label_encoders, 'models/label_encoders.pkl')
    joblib.dump(target_le, 'models/target_encoder.pkl')
    
    # Evaluate all dataset candidates using the newly trained model
    evaluate_all_candidates_from_dataset()

def evaluate_all_candidates_from_dataset():
    if CURRENT_DATA['df_raw'] is None or CURRENT_DATA['model'] is None:
        return
    
    df = CURRENT_DATA['df_raw'].copy()
    model = CURRENT_DATA['model']
    features = CURRENT_DATA['features']
    encoders = CURRENT_DATA['label_encoders']
    target_le = CURRENT_DATA['target_encoder']
    
    # Ensure Candidate_ID and Candidate_Name are present
    if 'Candidate_ID' not in df.columns:
        df['Candidate_ID'] = [f"CAND-{1001 + i}" for i in range(len(df))]
    if 'Candidate_Name' not in df.columns:
        df['Candidate_Name'] = [f"Candidate {1001 + i}" for i in range(len(df))]
        
    analyzed = []
    
    for idx, row in df.iterrows():
        # Build feature vector
        vector = []
        for col in features:
            val = row.get(col)
            if val is None or (isinstance(val, float) and np.isnan(val)):
                if col in ['Experience', 'Technical_Score', 'Communication_Score', 'Aptitude_Score']:
                    val = 0
                elif col in ['Python', 'Java', 'SQL', 'PowerBI', 'Excel', 'JavaScript', 'Cybersecurity', 'Machine_Learning']:
                    val = 0
                else:
                    val = 'None'
                    
            if col in encoders:
                le = encoders[col]
                str_val = str(val)
                if str_val in le.classes_:
                    vector.append(le.transform([str_val])[0])
                else:
                    vector.append(0)
            else:
                try:
                    vector.append(float(val))
                except:
                    vector.append(0.0)
                    
        # Predict suitability
        pred_idx = model.predict([vector])[0]
        predicted_role = str(target_le.classes_[pred_idx])
        
        applied_role = str(row.get('Applied_Role', ''))
        is_suitable = predicted_role == applied_role
        
        # Capture skills list
        skills = []
        for s in ['Python', 'Java', 'SQL', 'PowerBI', 'Excel', 'JavaScript', 'Cybersecurity', 'Machine_Learning']:
            if row.get(s, 0) == 1:
                skills.append(s)
        skills_str = ", ".join(skills) if skills else "None"
        
        cand_data = {
            'candidate_id': str(row['Candidate_ID']),
            'name': str(row['Candidate_Name']),
            'applied_role': applied_role,
            'predicted_role': predicted_role,
            'skills': skills_str,
            'experience': int(row.get('Experience', 0)),
            'education': str(row.get('Education', "Bachelor's")),
            'technical_score': int(row.get('Technical_Score', 0)),
            'communication_score': int(row.get('Communication_Score', 0)),
            'aptitude_score': int(row.get('Aptitude_Score', 0)),
            'certifications': str(row.get('Certifications', 'None')),
            'python': int(row.get('Python', 0)),
            'java': int(row.get('Java', 0)),
            'sql': int(row.get('SQL', 0)),
            'powerbi': int(row.get('PowerBI', 0)),
            'excel': int(row.get('Excel', 0)),
            'javascript': int(row.get('JavaScript', 0)),
            'cybersecurity': int(row.get('Cybersecurity', 0)),
            'machine_learning': int(row.get('Machine_Learning', 0)),
            'status': 'Suitable' if is_suitable else 'Not Suitable',
            'alternatives': []
        }
        analyzed.append(cand_data)
        
    # Preserve manually added candidates that are not in the raw dataset
    dataset_ids = set(df['Candidate_ID'].astype(str))
    preserved = [c for c in CURRENT_DATA.get('analyzed_candidates', []) if c['candidate_id'] not in dataset_ids]
    
    CURRENT_DATA['analyzed_candidates'] = analyzed + preserved

    # Precalculate alternative recommendations for the top 3 "Not Suitable" candidates
    not_suitable_cands = [c for c in CURRENT_DATA['analyzed_candidates'] if c['status'] == 'Not Suitable']
    
    precalculated_recos = []
    for candidate in not_suitable_cands:
        vector = []
        for col in features:
            val = candidate.get(col.lower() if col in ['Python', 'Java', 'SQL', 'PowerBI', 'Excel'] else col)
            if val is None:
                val = candidate.get(col)
            if val is None:
                if col in ['Experience', 'Technical_Score', 'Communication_Score', 'Aptitude_Score']:
                    val = 0
                elif col in ['Python', 'Java', 'SQL', 'PowerBI', 'Excel']:
                    val = 0
                else:
                    val = 'None'
                    
            if col in encoders:
                le = encoders[col]
                str_val = str(val)
                if str_val in le.classes_:
                    vector.append(le.transform([str_val])[0])
                else:
                    vector.append(0)
            else:
                try:
                    vector.append(float(val))
                except:
                    vector.append(0.0)
                    
        # Predict probabilities
        probs = model.predict_proba([vector])[0]
        classes = target_le.classes_
        
        alt_roles = []
        applied_role = candidate['applied_role']
        predicted_role = candidate['predicted_role']
        
        for idx, prob in enumerate(probs):
            role_name = str(classes[idx])
            if role_name == applied_role or role_name == predicted_role:
                continue
                
            cand_dict = {
                'Technical_Score': candidate['technical_score'],
                'Communication_Score': candidate['communication_score'],
                'Aptitude_Score': candidate['aptitude_score'],
                'Experience': candidate['experience'],
                'Python': candidate['python'],
                'Java': candidate['java'],
                'SQL': candidate['sql'],
                'PowerBI': candidate['powerbi'],
                'Excel': candidate['excel'],
                'JavaScript': candidate.get('javascript', 0),
                'Cybersecurity': candidate.get('cybersecurity', 0),
                'Machine_Learning': candidate.get('machine_learning', 0),
                'Certifications': candidate['certifications']
            }
            
            custom_pct = calculate_profile_match_pct(cand_dict, role_name, float(prob))
            
            alt_roles.append({
                'role': role_name,
                'match_pct': custom_pct,
                'reasons': get_matching_explanation(cand_dict, role_name)
            })
            
        alt_roles = sorted(alt_roles, key=lambda x: x['match_pct'], reverse=True)
        top_3 = alt_roles[:3]
        
        # Save alternatives back to candidate dict
        candidate['alternatives'] = top_3
        
        # Compute maximum match percentage of the alternative roles
        max_match_pct = top_3[0]['match_pct'] if top_3 else 0.0
        
        reco_entry = {
            'candidate_id': candidate['candidate_id'],
            'name': candidate['name'],
            'applied_role': candidate['applied_role'],
            'predicted_role': candidate['predicted_role'],
            'top_alternatives': top_3,
            'max_match_pct': max_match_pct
        }
        precalculated_recos.append(reco_entry)
        
    # Sort candidates by their maximum alternative match percentage in descending order
    precalculated_recos = sorted(precalculated_recos, key=lambda x: x['max_match_pct'], reverse=True)
    
    # Keep only the top 3 candidates
    top_3_candidates_recos = precalculated_recos[:3]
    
    for r in top_3_candidates_recos:
        r.pop('max_match_pct', None)
        
    CURRENT_DATA['alternative_recommendations'] = top_3_candidates_recos

def extract_tree_json(tree_model, feature_names, class_names):
    """Recursively converts a scikit-learn DecisionTreeClassifier into a JSON tree hierarchy."""
    tree_ = tree_model.tree_

    def recurse(node):
        if tree_.feature[node] != _tree.TREE_UNDEFINED:
            name = feature_names[tree_.feature[node]]
            threshold = float(tree_.threshold[node])
            val_counts = tree_.value[node][0].tolist()
            total_samples = int(tree_.n_node_samples[node])
            impurity = float(tree_.impurity[node])
            left = recurse(tree_.children_left[node])
            right = recurse(tree_.children_right[node])
            return {
                "type": "node",
                "feature": name,
                "threshold": round(threshold, 2),
                "impurity": round(impurity, 3),
                "samples": total_samples,
                "values": val_counts,
                "left": left,
                "right": right
            }
        else:
            val_counts = tree_.value[node][0].tolist()
            pred_class_idx = int(np.argmax(val_counts))
            pred_class = str(class_names[pred_class_idx]) if class_names is not None else str(pred_class_idx)
            total_samples = int(tree_.n_node_samples[node])
            impurity = float(tree_.impurity[node])
            return {
                "type": "leaf",
                "label": pred_class,
                "impurity": round(impurity, 3),
                "samples": total_samples,
                "values": val_counts
            }

    return recurse(0)

# Load default dataset on start
# load_default_dataset()


# ── Flask Context Processor ──
@app.context_processor
def inject_global_vars():
    """Injects dataset status variables globally across all Jinja templates."""
    loaded = CURRENT_DATA['df_raw'] is not None
    count = len(CURRENT_DATA['df_raw']) if loaded else 0
    return {
        'dataset_loaded': loaded,
        'record_count': count
    }


# ── Pages Routes ──
@app.route('/')
def dashboard():
    if CURRENT_DATA['df_raw'] is None:
        return render_template('index.html', stats=None)
        
    df = CURRENT_DATA['df_raw']
    total_candidates = len(df)
    
    # Calculate statuses
    selected_count = 0
    rejected_count = 0
    if 'Final_Status' in df.columns:
        selected_count = int((df['Final_Status'] == 'Selected').sum())
        rejected_count = int((df['Final_Status'] == 'Rejected').sum())
    elif 'Selected_Role' in df.columns and 'Applied_Role' in df.columns:
        selected_count = int((df['Selected_Role'] == df['Applied_Role']).sum())
        rejected_count = total_candidates - selected_count
    else:
        selected_count = int(total_candidates * 0.4)
        rejected_count = total_candidates - selected_count
        
    selection_rate = round((selected_count / total_candidates) * 100, 1) if total_candidates > 0 else 0
    
    # Avg scores
    tech_col = next((c for c in df.columns if 'tech' in c.lower()), None)
    exp_col = next((c for c in df.columns if 'exp' in c.lower()), None)
    
    avg_tech = round(df[tech_col].mean(), 1) if tech_col else 0.0
    avg_exp = round(df[exp_col].mean(), 1) if exp_col else 0.0
    
    stats = {
        'total': total_candidates,
        'selected': selected_count,
        'rejected': rejected_count,
        'rate': selection_rate,
        'avg_tech': avg_tech,
        'avg_exp': avg_exp
    }
    
    return render_template('index.html', stats=stats)

@app.route('/upload')
def upload_page():
    return render_template('upload.html')

@app.route('/analysis')
def analysis_page():
    if CURRENT_DATA['df_raw'] is None:
        return render_template('analysis.html')
        
    df = CURRENT_DATA['df_raw']
    
    # Dataset dimensions
    rows, cols = df.shape
    columns = list(df.columns)
    
    # Basic data types
    dtypes = {col: str(df[col].dtype) for col in df.columns}
    
    # Missing values
    missing = df.isnull().sum().to_dict()
    
    # Duplicate rows
    duplicates = int(df.duplicated().sum())
    
    # Unique values
    uniques = {col: int(df[col].nunique()) for col in df.columns}
    
    # Basic statistics for numeric columns
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    stats_dict = {}
    for col in numeric_cols:
        stats_dict[col] = {
            'mean': round(df[col].mean(), 2),
            'median': round(df[col].median(), 2),
            'min': round(df[col].min(), 2),
            'max': round(df[col].max(), 2),
            'std': round(df[col].std(), 2)
        }
        
    return render_template(
        'analysis.html',
        dimensions={'rows': rows, 'cols': cols},
        columns=columns,
        dtypes=dtypes,
        missing=missing,
        duplicates=duplicates,
        uniques=uniques,
        stats=stats_dict
    )

@app.route('/preprocessing')
def preprocessing_page():
    return render_template('preprocessing.html', stats=CURRENT_DATA['preprocessing_stats'])

@app.route('/visualization')
def visualization_page():
    return render_template('visualization.html')

@app.route('/decision-tree')
def decision_tree_page():
    if CURRENT_DATA['model'] is None:
        return render_template('decision_tree.html')
        
    clf = CURRENT_DATA['model']
    features = CURRENT_DATA['features']
    target = CURRENT_DATA['target_col']
    
    # Training size
    df = CURRENT_DATA['df_clean']
    train_size = int(len(df) * 0.8)
    test_size = len(df) - train_size
    
    # Re-calc metrics on test split dynamically
    X_encoded = pd.DataFrame()
    for col in features:
        if np.issubdtype(df[col].dtype, np.number):
            X_encoded[col] = df[col]
        else:
            le = CURRENT_DATA['label_encoders'][col]
            X_encoded[col] = le.transform(df[col].astype(str))
            
    target_le = CURRENT_DATA['target_encoder']
    y_encoded = target_le.transform(df[target].astype(str))
    
    X_train, X_test, y_train, y_test = train_test_split(X_encoded, y_encoded, test_size=0.2, random_state=42)
    y_pred = clf.predict(X_test)
    
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average='weighted', zero_division=0)
    rec = recall_score(y_test, y_pred, average='weighted', zero_division=0)
    f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
    cm = confusion_matrix(y_test, y_pred).tolist()
    
    # Feature importance
    importances = clf.feature_importances_
    feat_imp = sorted([
        {'feature': f, 'importance': round(imp * 100, 1)} for f, imp in zip(features, importances)
    ], key=lambda x: x['importance'], reverse=True)
    
    metrics = {
        'accuracy': round(acc * 100, 1),
        'precision': round(prec * 100, 1),
        'recall': round(rec * 100, 1),
        'f1': round(f1 * 100, 1),
        'cm': cm,
        'classes': list(target_le.classes_)
    }
    
    # Text rules
    rules_text = export_text(clf, feature_names=features)
    
    return render_template(
        'decision_tree.html',
        features=features,
        target=target,
        train_size=train_size,
        test_size=test_size,
        metrics=metrics,
        feature_importance=feat_imp,
        rules_text=rules_text
    )

@app.route('/prediction')
def prediction_page():
    return render_template('prediction.html')

@app.route('/recommendation')
def recommendation_page():
    return render_template('recommendation.html')

@app.route('/reports')
def reports_page():
    return render_template('reports.html')

@app.route('/matched-candidates')
def matched_candidates_page():
    candidates = [c for c in CURRENT_DATA.get('analyzed_candidates', []) if c['status'] == 'Suitable']
    return render_template('matched_candidates.html', candidates=candidates)

@app.route('/non-matched-candidates')
def non_matched_candidates_page():
    candidates = [c for c in CURRENT_DATA.get('analyzed_candidates', []) if c['status'] == 'Not Suitable']
    return render_template('non_matched_candidates.html', candidates=candidates)

@app.route('/alternative-recommendations')
def alternative_recommendations_page():
    recommendations = CURRENT_DATA.get('alternative_recommendations', [])
    return render_template('alternative_recommendations.html', recommendations=recommendations)


# ── API Endpoints ──
@app.route('/api/dataset-info', methods=['GET'])
def get_dataset_info():
    if CURRENT_DATA['df_raw'] is None:
        return jsonify({'loaded': False})
    
    df = CURRENT_DATA['df_raw'].copy()

    # Strip unnamed columns
    unnamed_cols = [c for c in df.columns if 'unnamed' in str(c).lower()]
    if unnamed_cols:
        df = df.drop(columns=unnamed_cols)

    columns_info = []
    for col in df.columns:
        unique_vals = int(df[col].nunique())
        missing = int(df[col].isnull().sum())
        columns_info.append({
            'name': str(col),
            'type': 'Numeric' if np.issubdtype(df[col].dtype, np.number) else 'Categorical',
            'unique_count': unique_vals,
            'missing_count': missing
        })

    # JSON-safe clean records
    clean_records = df.fillna('').to_dict(orient='records')
    for row in clean_records:
        for k, v in row.items():
            if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                row[k] = 0

    summary = {
        'total_records': len(df),
        'total_features': len(df.columns),
        'target_col': CURRENT_DATA['target_col'],
        'columns': columns_info,
        'preview_data': clean_records
    }
    return jsonify({'loaded': True, 'data': summary})

@app.route('/api/upload', methods=['POST'])
def api_upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
        
    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'Only CSV files are allowed'}), 400
        
    try:
        path = os.path.join('uploads', file.filename)
        file.save(path)
        
        df = pd.read_csv(path)
        
        # Verify columns mapping or presence
        required = ['Education', 'Experience', 'Technical_Score', 'Communication_Score', 'Applied_Role']
        # Try custom mapping if column names are slightly different
        mapping = {}
        for col in df.columns:
            col_lower = col.lower()
            if 'education' in col_lower and 'level' in col_lower:
                mapping[col] = 'Education'
            elif 'education' in col_lower:
                mapping[col] = 'Education'
            elif 'experience' in col_lower:
                mapping[col] = 'Experience'
            elif 'technical' in col_lower and 'score' in col_lower:
                mapping[col] = 'Technical_Score'
            elif 'communication' in col_lower and 'score' in col_lower:
                mapping[col] = 'Communication_Score'
            elif 'soft' in col_lower and 'skills' in col_lower:
                # scale rating out of 5 to 100
                df[col] = df[col] * 20
                mapping[col] = 'Communication_Score'
            elif 'aptitude' in col_lower and 'score' in col_lower:
                mapping[col] = 'Aptitude_Score'
            elif 'portfolio' in col_lower and 'score' in col_lower:
                mapping[col] = 'Aptitude_Score'
            elif 'certification' in col_lower:
                mapping[col] = 'Certifications'
            elif 'python' in col_lower:
                mapping[col] = 'Python'
            elif 'javascript' in col_lower:
                mapping[col] = 'JavaScript'
            elif 'java' in col_lower:
                mapping[col] = 'Java'
            elif 'sql' in col_lower:
                mapping[col] = 'SQL'
            elif 'power' in col_lower and 'bi' in col_lower:
                mapping[col] = 'PowerBI'
            elif 'excel' in col_lower:
                mapping[col] = 'Excel'
            elif 'cybersecurity' in col_lower or 'cyber' in col_lower:
                mapping[col] = 'Cybersecurity'
            elif 'machine' in col_lower or 'learning' in col_lower or 'ml' in col_lower:
                mapping[col] = 'Machine_Learning'
            elif 'applied' in col_lower and 'role' in col_lower:
                mapping[col] = 'Applied_Role'
            elif 'selected' in col_lower and 'role' in col_lower:
                mapping[col] = 'Selected_Role'
            elif 'status' in col_lower:
                mapping[col] = 'Final_Status'
                
        if mapping:
            df = df.rename(columns=mapping)
            
        # Deduplicate columns if any duplicates were created by mapping or existed in CSV
        if df.columns.duplicated().any():
            cols = pd.Series(df.columns)
            for dup in cols[cols.duplicated()].unique():
                cols[cols == dup] = [f"{dup}_{i}" if i != 0 else dup for i in range(sum(cols == dup))]
            df.columns = cols
            
        # If still missing some columns, let's create placeholders so the system doesn't crash
        if 'Aptitude_Score' not in df.columns:
            df['Aptitude_Score'] = 70
        if 'Certifications' not in df.columns:
            df['Certifications'] = 'None'
        if 'Python' not in df.columns:
            df['Python'] = 0
        if 'Java' not in df.columns:
            df['Java'] = 0
        if 'SQL' not in df.columns:
            df['SQL'] = 0
        if 'PowerBI' not in df.columns:
            df['PowerBI'] = 0
        if 'Excel' not in df.columns:
            df['Excel'] = 0
        if 'JavaScript' not in df.columns:
            df['JavaScript'] = 0
        if 'Cybersecurity' not in df.columns:
            df['Cybersecurity'] = 0
        if 'Machine_Learning' not in df.columns:
            df['Machine_Learning'] = 0
        if 'Selected_Role' not in df.columns:
            # Assume they are selected for their applied role by default
            df['Selected_Role'] = df['Applied_Role']
        if 'Final_Status' not in df.columns:
            df['Final_Status'] = 'Selected'
            
        # Re-check columns
        missing_critical = [c for c in required if c not in df.columns]
        if missing_critical:
            return jsonify({'error': f'Uploaded CSV is missing critical recruitment columns: {missing_critical}'}), 400
            
        CURRENT_DATA['df_raw'] = df.copy()
        preprocess_dataset_internally()
        
        # Return summary stats for client
        rows, cols = df.shape
        duplicates = int(df.duplicated().sum())
        missing_count = int(df.isnull().sum().sum())
        
        return jsonify({
            'success': True,
            'filename': file.filename,
            'rows': rows,
            'cols': cols,
            'duplicates': duplicates,
            'missing': missing_count,
            'columns': list(df.columns)
        })
        
    except Exception as e:
        return jsonify({'error': f'Failed to process file: {str(e)}'}), 500

@app.route('/api/reset', methods=['POST'])
def api_reset():
    try:
        CURRENT_DATA['df_raw'] = None
        CURRENT_DATA['df_clean'] = None
        CURRENT_DATA['model'] = None
        CURRENT_DATA['label_encoders'] = {}
        CURRENT_DATA['target_encoder'] = None
        CURRENT_DATA['preprocessing_stats'] = {
            'before': {'rows': 0, 'missing': 0, 'duplicates': 0},
            'after': {'rows': 0, 'missing': 0, 'duplicates': 0}
        }
        CURRENT_DATA['analyzed_candidates'] = []
        CURRENT_DATA['alternative_recommendations'] = []
        
        # Remove serialized models
        for fn in ['decision_tree_model.pkl', 'label_encoders.pkl', 'target_encoder.pkl']:
            path = os.path.join('models', fn)
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception as e:
                    print(f"Error removing model file {path}: {e}")
                    
        # Remove uploaded datasets
        if os.path.exists('uploads'):
            for fn in os.listdir('uploads'):
                path = os.path.join('uploads', fn)
                try:
                    if os.path.isfile(path):
                        os.remove(path)
                except Exception as e:
                    print(f"Error removing upload file {path}: {e}")
                    
        return jsonify({'success': True, 'message': 'Dataset and analysis reset successfully.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chart-data')
def api_chart_data():
    if CURRENT_DATA['df_raw'] is None:
        return jsonify({'error': 'No dataset loaded'}), 400
        
    df = CURRENT_DATA['df_raw']
    
    # 1. Candidate count by Job Role
    roles_dist = df['Applied_Role'].value_counts().to_dict()
    
    # 2. Selected vs Rejected status distribution
    status_dist = {}
    if 'Final_Status' in df.columns:
        status_dist = df['Final_Status'].value_counts().to_dict()
    
    # 3. Experience vs Selection
    exp_bins = [0, 2, 5, 8, 15]
    exp_labels = ['Entry (0-2)', 'Junior (2-5)', 'Mid (5-8)', 'Senior (8+)']
    df_exp = df.copy()
    df_exp['ExpGroup'] = pd.cut(df_exp['Experience'], bins=exp_bins, labels=exp_labels, include_lowest=True)
    exp_dist = df_exp['ExpGroup'].value_counts().to_dict()
    
    # 4. Tech score distribution
    tech_bins = [0, 50, 70, 85, 100]
    tech_labels = ['Below Average (<50)', 'Average (50-70)', 'Good (70-85)', 'Excellent (85-100)']
    df_tech = df.copy()
    df_tech['TechGroup'] = pd.cut(df_tech['Technical_Score'], bins=tech_bins, labels=tech_labels, include_lowest=True)
    tech_dist = df_tech['TechGroup'].value_counts().to_dict()
    
    # 5. Education level distribution
    edu_dist = df['Education'].value_counts().to_dict()
    
    # 6. Skill presence count
    skills = ['Python', 'Java', 'SQL', 'PowerBI', 'Excel', 'JavaScript', 'Cybersecurity', 'Machine_Learning']
    skills_count = {skill: int(df[skill].sum()) for skill in skills if skill in df.columns}
    
    # 7. Selection rate by job role
    sel_rate_by_role = {}
    if 'Applied_Role' in df.columns and 'Final_Status' in df.columns:
        for r in df['Applied_Role'].unique():
            sub = df[df['Applied_Role'] == r]
            sel = (sub['Final_Status'] == 'Selected').sum()
            rate = round((sel / len(sub)) * 100, 1) if len(sub) > 0 else 0
            sel_rate_by_role[str(r)] = rate
            
    return jsonify({
        'roles': {str(k): int(v) for k, v in roles_dist.items()},
        'status': {str(k): int(v) for k, v in status_dist.items()},
        'experience': {str(k): int(v) for k, v in exp_dist.items()},
        'tech_score': {str(k): int(v) for k, v in tech_dist.items()},
        'education': {str(k): int(v) for k, v in edu_dist.items()},
        'skills': skills_count,
        'selection_rate_by_role': sel_rate_by_role
    })

@app.route('/api/predict', methods=['POST'])
def api_predict():
    if CURRENT_DATA['model'] is None:
        return jsonify({'error': 'Decision Tree model is not trained. Please upload a dataset first.'}), 400
        
    data = request.json
    if not data:
        return jsonify({'error': 'No input data provided'}), 400
        
    clf = CURRENT_DATA['model']
    features = CURRENT_DATA['features']
    encoders = CURRENT_DATA['label_encoders']
    target_le = CURRENT_DATA['target_encoder']
    
    # Build vector
    vector = []
    for col in features:
        val = data.get(col)
        # default fallbacks
        if val is None:
            if col in ['Experience', 'Technical_Score', 'Communication_Score', 'Aptitude_Score']:
                val = 0
            elif col in ['Python', 'Java', 'SQL', 'PowerBI', 'Excel', 'JavaScript', 'Cybersecurity', 'Machine_Learning']:
                val = 0
            else:
                val = 'None'
                
        # encode
        if col in encoders:
            le = encoders[col]
            str_val = str(val)
            if str_val in le.classes_:
                vector.append(le.transform([str_val])[0])
            else:
                # check if there is an unknown/default
                vector.append(0)
        else:
            try:
                vector.append(float(val))
            except:
                vector.append(0.0)
                
    # Predict
    pred_idx = clf.predict([vector])[0]
    recommended_role = str(target_le.classes_[pred_idx])
    
    probs = clf.predict_proba([vector])[0]
    confidence = round(float(probs[pred_idx]) * 100, 1)
    
    applied_role = data.get('Applied_Role')
    
    # Calculate all alternatives ranked
    alt_roles = []
    classes = target_le.classes_
    for idx, prob in enumerate(probs):
        role_name = str(classes[idx])
        if role_name == applied_role or role_name == recommended_role:
            continue
            
        custom_pct = calculate_profile_match_pct(data, role_name, float(prob))
        alt_roles.append({
            'role': role_name,
            'match_pct': custom_pct,
            'reasons': get_matching_explanation(data, role_name)
        })
        
    # Sort by match percentage
    alt_roles = sorted(alt_roles, key=lambda x: x['match_pct'], reverse=True)
    
    # Check if suitable for applied role
    is_suitable = recommended_role == applied_role
    
    # Find matching details for recommended role
    explanation = get_matching_explanation(data, recommended_role)
    
    # Store this candidate's prediction in the analyzed list
    candidate_id = data.get('Candidate_ID')
    candidate_name = data.get('Candidate_Name')
    
    # Auto-generate if missing (should not be missing because form requires it)
    if not candidate_id:
        candidate_id = f"CAND-{1000 + len(CURRENT_DATA.get('analyzed_candidates', []))}"
    if not candidate_name:
        candidate_name = f"Candidate {1000 + len(CURRENT_DATA.get('analyzed_candidates', []))}"
        
    skills = []
    for s in ['Python', 'Java', 'SQL', 'PowerBI', 'Excel', 'JavaScript', 'Cybersecurity', 'Machine_Learning']:
        if data.get(s, 0) == 1:
            skills.append(s)
    skills_str = ", ".join(skills) if skills else "None"
    
    cand_record = {
        'candidate_id': str(candidate_id),
        'name': str(candidate_name),
        'applied_role': str(applied_role),
        'predicted_role': str(recommended_role),
        'skills': skills_str,
        'experience': int(data.get('Experience', 0)),
        'education': str(data.get('Education', "Bachelor's")),
        'technical_score': int(data.get('Technical_Score', 0)),
        'communication_score': int(data.get('Communication_Score', 0)),
        'aptitude_score': int(data.get('Aptitude_Score', 0)),
        'certifications': str(data.get('Certifications', 'None')),
        'python': int(data.get('Python', 0)),
        'java': int(data.get('Java', 0)),
        'sql': int(data.get('SQL', 0)),
        'powerbi': int(data.get('PowerBI', 0)),
        'excel': int(data.get('Excel', 0)),
        'javascript': int(data.get('JavaScript', 0)),
        'cybersecurity': int(data.get('Cybersecurity', 0)),
        'machine_learning': int(data.get('Machine_Learning', 0)),
        'status': 'Suitable' if is_suitable else 'Not Suitable',
        'alternatives': []
    }
    
    # Check if exists, update or append
    exists = False
    for i, c in enumerate(CURRENT_DATA.get('analyzed_candidates', [])):
        if c['candidate_id'] == candidate_id:
            CURRENT_DATA['analyzed_candidates'][i] = cand_record
            exists = True
            break
    if not exists:
        if 'analyzed_candidates' not in CURRENT_DATA:
            CURRENT_DATA['analyzed_candidates'] = []
        CURRENT_DATA['analyzed_candidates'].append(cand_record)
        
    return jsonify({
        'success': True,
        'recommended_role': recommended_role,
        'confidence': confidence,
        'is_suitable': is_suitable,
        'explanation': explanation,
        'alternatives': alt_roles,
        'candidate_summary': data
    })

@app.route('/api/analyze-alternatives', methods=['POST'])
def api_analyze_alternatives():
    if CURRENT_DATA['model'] is None:
        return jsonify({'error': 'Model not trained.'}), 400
        
    data = request.json
    if not data or 'candidate_id' not in data:
        return jsonify({'error': 'Candidate ID is required'}), 400
        
    candidate_id = data['candidate_id']
    
    # Find candidate
    candidate = None
    for cand in CURRENT_DATA.get('analyzed_candidates', []):
        if cand['candidate_id'] == candidate_id:
            candidate = cand
            break
            
    if not candidate:
        return jsonify({'error': 'Candidate not found'}), 404
        
    # Run alternate role comparison
    clf = CURRENT_DATA['model']
    features = CURRENT_DATA['features']
    encoders = CURRENT_DATA['label_encoders']
    target_le = CURRENT_DATA['target_encoder']
    
    # Build vector for this candidate
    vector = []
    for col in features:
        val = candidate.get(col.lower() if col in ['Python', 'Java', 'SQL', 'PowerBI', 'Excel'] else col)
        if val is None:
            val = candidate.get(col)
        if val is None:
            if col in ['Experience', 'Technical_Score', 'Communication_Score', 'Aptitude_Score']:
                val = 0
            elif col in ['Python', 'Java', 'SQL', 'PowerBI', 'Excel']:
                val = 0
            else:
                val = 'None'
                
        if col in encoders:
            le = encoders[col]
            str_val = str(val)
            if str_val in le.classes_:
                vector.append(le.transform([str_val])[0])
            else:
                vector.append(0)
        else:
            try:
                vector.append(float(val))
            except:
                vector.append(0.0)
                
    # Predict probabilities for all roles
    probs = clf.predict_proba([vector])[0]
    classes = target_le.classes_
    
    alt_roles = []
    applied_role = candidate['applied_role']
    predicted_role = candidate['predicted_role']
    
    for idx, prob in enumerate(probs):
        role_name = str(classes[idx])
        # EXCLUDE the applied role AND the recommended/predicted role
        if role_name == applied_role or role_name == predicted_role:
            continue
            
        cand_dict = {
            'Technical_Score': candidate['technical_score'],
            'Communication_Score': candidate['communication_score'],
            'Aptitude_Score': candidate['aptitude_score'],
            'Experience': candidate['experience'],
            'Python': candidate['python'],
            'Java': candidate['java'],
            'SQL': candidate['sql'],
            'PowerBI': candidate['powerbi'],
            'Excel': candidate['excel'],
            'JavaScript': candidate.get('javascript', 0),
            'Cybersecurity': candidate.get('cybersecurity', 0),
            'Machine_Learning': candidate.get('machine_learning', 0),
            'Certifications': candidate['certifications']
        }
        
        custom_pct = calculate_profile_match_pct(cand_dict, role_name, float(prob))
        
        alt_roles.append({
            'role': role_name,
            'match_pct': custom_pct,
            'reasons': get_matching_explanation(cand_dict, role_name)
        })
        
    # Rank alternative roles from highest to lowest matching percentage
    alt_roles = sorted(alt_roles, key=lambda x: x['match_pct'], reverse=True)
    
    # Take TOP 3 highest matching
    top_3 = alt_roles[:3]
    
    # Store this recommendation in candidate's record
    candidate['alternatives'] = top_3
    
    # Also ensure it is stored or updated in alternative recommendations list
    reco_entry = {
        'candidate_id': candidate['candidate_id'],
        'name': candidate['name'],
        'applied_role': candidate['applied_role'],
        'predicted_role': candidate['predicted_role'],
        'top_alternatives': top_3
    }
    
    # Remove old entry if exists, then append
    CURRENT_DATA['alternative_recommendations'] = [
        r for r in CURRENT_DATA.get('alternative_recommendations', []) 
        if r['candidate_id'] != candidate_id
    ]
    if 'alternative_recommendations' not in CURRENT_DATA:
        CURRENT_DATA['alternative_recommendations'] = []
    CURRENT_DATA['alternative_recommendations'].append(reco_entry)
    
    return jsonify({
        'success': True,
        'candidate_id': candidate_id,
        'name': candidate['name'],
        'applied_role': applied_role,
        'predicted_role': candidate['predicted_role'],
        'alternatives': top_3
    })

def calculate_profile_match_pct(cand_data, role, base_prob):
    """Calculates a personalized percentage score (out of 100) based on role requirements alignment."""
    tech = float(cand_data.get('Technical_Score', 0) or cand_data.get('technical_score', 0))
    comm = float(cand_data.get('Communication_Score', 0) or cand_data.get('communication_score', 0))
    apt = float(cand_data.get('Aptitude_Score', 0) or cand_data.get('aptitude_score', 0))
    exp = float(cand_data.get('Experience', 0) or cand_data.get('experience', 0))
    
    py = int(cand_data.get('Python', 0) or cand_data.get('python', 0))
    jv = int(cand_data.get('Java', 0) or cand_data.get('java', 0))
    sq = int(cand_data.get('SQL', 0) or cand_data.get('sql', 0))
    pb = int(cand_data.get('PowerBI', 0) or cand_data.get('powerbi', 0))
    ex = int(cand_data.get('Excel', 0) or cand_data.get('excel', 0))
    js = int(cand_data.get('JavaScript', 0) or cand_data.get('javascript', 0))
    cy = int(cand_data.get('Cybersecurity', 0) or cand_data.get('cybersecurity', 0))
    ml = int(cand_data.get('Machine_Learning', 0) or cand_data.get('machine_learning', 0))
    cert = str(cand_data.get('Certifications', '') or cand_data.get('certifications', '')).lower()
    
    score = 0.0
    
    if role == 'Software Engineer':
        score += min(tech / 100.0, 1.0) * 30
        score += (30.0 if (py == 1 or jv == 1) else 0.0)
        score += min(exp / 6.0, 1.0) * 20
        score += min(apt / 100.0, 1.0) * 20
    elif role == 'Data Analyst':
        score += (35.0 if sq == 1 else 0.0)
        score += (35.0 if (pb == 1 or ex == 1) else 0.0)
        score += min(apt / 100.0, 1.0) * 30
    elif role == 'Cloud Engineer':
        score += (45.0 if ('aws' in cert or 'azure' in cert or 'cloud' in cert) else 0.0)
        score += min(tech / 100.0, 1.0) * 30
        score += min(apt / 100.0, 1.0) * 25
    elif role == 'DevOps Specialist':
        score += (35.0 if py == 1 else 0.0)
        score += min(exp / 6.0, 1.0) * 35
        score += min(tech / 100.0, 1.0) * 30
    elif role == 'Business Analyst':
        score += min(comm / 100.0, 1.0) * 45
        score += (30.0 if ex == 1 else 0.0)
        score += min(apt / 100.0, 1.0) * 25
    elif role == 'QA Engineer':
        score += min(tech / 100.0, 1.0) * 40
        score += (30.0 if sq == 1 else 0.0)
        score += (30.0 if ex == 1 else 0.0)
    elif role == 'Product Manager':
        score += (45.0 if ('pmp' in cert or 'scrum' in cert or 'pm' in cert) else 0.0)
        score += min(comm / 100.0, 1.0) * 30
        score += min(exp / 7.0, 1.0) * 25
    elif role == 'AI / ML Engineer':
        score += (45.0 if ('tensorflow' in cert or 'keras' in cert or 'ml' in cert) else 0.0)
        score += (30.0 if (ml == 1 or py == 1) else 0.0)
        score += min(tech / 100.0, 1.0) * 25
    elif role == 'Cybersecurity Specialist':
        score += (45.0 if ('security+' in cert or 'comptia' in cert or 'cyber' in cert) else 0.0)
        score += (30.0 if cy == 1 else 0.0)
        score += min(tech / 100.0, 1.0) * 25
    else:
        score += (tech + comm + apt) / 3.0
        
    final_pct = (base_prob * 30.0) + (score * 0.7)
    return round(final_pct, 1)

def get_matching_explanation(cand_data, role):
    """Generates a text description explaining why a candidate is suitable for a role."""
    reasons = []
    
    tech = float(cand_data.get('Technical_Score', 0))
    comm = float(cand_data.get('Communication_Score', 0))
    apt = float(cand_data.get('Aptitude_Score', 0))
    exp = float(cand_data.get('Experience', 0))
    
    py = int(cand_data.get('Python', 0))
    jv = int(cand_data.get('Java', 0))
    sq = int(cand_data.get('SQL', 0))
    pb = int(cand_data.get('PowerBI', 0))
    ex = int(cand_data.get('Excel', 0))
    js = int(cand_data.get('JavaScript', 0) or cand_data.get('javascript', 0))
    cy = int(cand_data.get('Cybersecurity', 0) or cand_data.get('cybersecurity', 0))
    ml = int(cand_data.get('Machine_Learning', 0) or cand_data.get('machine_learning', 0))
    
    cert = str(cand_data.get('Certifications', ''))
    
    if role == 'Software Engineer':
        if tech >= 70: reasons.append(f"Strong coding foundations (Technical Score: {tech}/100)")
        if py == 1 or jv == 1: reasons.append("Possesses core programming skills (Python/Java)")
        if exp >= 2: reasons.append(f"Has {exp} years of developer experience")
    elif role == 'Data Analyst':
        if sq == 1: reasons.append("Relational database query skills (SQL)")
        if pb == 1 or ex == 1: reasons.append("Proficiency in business analytics tools (PowerBI/Excel)")
        if apt >= 65: reasons.append("Logical and quantitative mindset (Aptitude Score)")
    elif role == 'Cloud Engineer':
        if 'AWS' in cert or 'Azure' in cert: reasons.append(f"Professional Cloud Accreditation ({cert})")
        if tech >= 60: reasons.append("Solid network/infrastructure technical base")
    elif role == 'DevOps Specialist':
        if py == 1: reasons.append("Scripting automation skills (Python)")
        if exp >= 3: reasons.append("Substantial software pipeline experience")
    elif role == 'Business Analyst':
        if comm >= 70: reasons.append("Excellent communication skills for stakeholder management")
        if ex == 1: reasons.append("Financial modeling/analytics tool proficiency (Excel)")
    elif role == 'QA Engineer':
        if tech >= 55: reasons.append("Adequate technical aptitude for test automation")
        if sq == 1: reasons.append("Familiar with database integrity checks")
    elif role == 'Product Manager':
        if 'PMP' in cert or 'Scrum' in cert: reasons.append(f"Professional management cert: {cert}")
        if comm >= 75: reasons.append("High leadership and team alignment scoring")
    elif role == 'AI / ML Engineer':
        if 'TensorFlow' in cert: reasons.append(f"TensorFlow Certified Developer Accreditation ({cert})")
        if ml == 1 or py == 1: reasons.append("Proficient in ML modeling and algorithmic logic (Python/TensorFlow)")
        if tech >= 75: reasons.append("Excellent programming/mathematical foundation")
    elif role == 'Cybersecurity Specialist':
        if 'Security+' in cert: reasons.append(f"CompTIA Security+ Network Accreditation ({cert})")
        if cy == 1: reasons.append("Accredited in threat response and network security")
        if tech >= 65: reasons.append("Solid hardware/network security technical base")
    else:
        if apt >= 70: reasons.append("Strong cognitive and problem-solving index")
        
    if not reasons:
        reasons.append("Overall profile metrics are balanced and fit entry-level standards.")
        
    return reasons

@app.route('/api/tree-json')
def api_tree_json():
    if CURRENT_DATA['model'] is None:
        return jsonify({'error': 'No model trained'}), 400
        
    clf = CURRENT_DATA['model']
    features = CURRENT_DATA['features']
    target_le = CURRENT_DATA['target_encoder']
    
    tree_json = extract_tree_json(clf, features, target_le.classes_)
    return jsonify(tree_json)

@app.route('/api/download-dataset')
def api_download_dataset():
    if CURRENT_DATA['df_raw'] is None:
        return jsonify({'error': 'No dataset to export'}), 404
        
    df = CURRENT_DATA['df_raw']
    output = io.StringIO()
    df.to_csv(output, index=False)
    
    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = "attachment; filename=recruitment_analysis_export.csv"
    response.headers["Content-type"] = "text/csv"
    return response

@app.route('/api/export-report')
def api_export_report():
    if CURRENT_DATA['df_raw'] is None:
        return jsonify({'error': 'No data available to generate report'}), 400
        
    df = CURRENT_DATA['df_raw']
    total = len(df)
    
    # Gather metrics
    selected = int((df['Final_Status'] == 'Selected').sum()) if 'Final_Status' in df.columns else 0
    rejected = total - selected
    sel_rate = round((selected / total) * 100, 1) if total > 0 else 0
    
    avg_tech = round(df['Technical_Score'].mean(), 1) if 'Technical_Score' in df.columns else 0
    avg_comm = round(df['Communication_Score'].mean(), 1) if 'Communication_Score' in df.columns else 0
    
    model_status = "Trained" if CURRENT_DATA['model'] is not None else "Untrained"
    
    report_data = {
        'Report_Title': 'Recruitment Decision Support System - Analysis Report',
        'Model_Status': model_status,
        'Dataset_Records': total,
        'Selected_Candidates': selected,
        'Rejected_Candidates': rejected,
        'Selection_Rate_Pct': sel_rate,
        'Average_Technical_Score': avg_tech,
        'Average_Communication_Score': avg_comm,
    }
    
    output = io.StringIO()
    # Write key-value pairs
    for k, v in report_data.items():
        output.write(f"{k},{v}\n")
    
    output.write("\n")
    output.write("Role Distribution Summary\n")
    role_dist = df['Applied_Role'].value_counts()
    for role, cnt in role_dist.items():
        output.write(f"{role},{cnt}\n")
        
    response = make_response(output.getvalue())
    response.headers["Content-Disposition"] = "attachment; filename=recruitment_dss_report.csv"
    response.headers["Content-type"] = "text/csv"
    return response


if __name__ == '__main__':
    print("Starting Recruitment DSS Flask Server on http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=True)
