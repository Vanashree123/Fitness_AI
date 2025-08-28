from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import sqlite3
import cv2
import mediapipe as mp
import numpy as np
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = "supersecret"

# --- Consistent Database Setup ---
DB_NAME = "fitness.db"

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_type TEXT NOT NULL,
            exercise TEXT NOT NULL,
            sets INTEGER NOT NULL,
            reps INTEGER NOT NULL,
            ts DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_db()

# --- Example POST endpoint for logs ---
@app.route('/save_log', methods=['POST'])
def save_log():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    user_id = session['user_id']
    workout_type = data.get("workoutType")
    exercise = data.get("exercise")
    sets = int(data.get("sets", 1))
    reps = int(data.get("reps", 0))

    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    try:
        c.execute("INSERT INTO logs (user_id, workout_type, exercise, sets, reps) VALUES (?, ?, ?, ?, ?)",
                  (user_id, workout_type, exercise, sets, reps))
        conn.commit()
        return jsonify({"message": "Log saved!"}), 201    # Returns 201 Created status
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# ========== Routes ==========
@app.route('/')
def index():
    return render_template("index.html")

@app.route('/signin ', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        name = request.form['name'].strip()
        email = request.form['email'].strip().lower()
        password = request.form['password']

        hashed = generate_password_hash(password)

        conn = sqlite3.connect("fitness.db")
        c = conn.cursor()
        try:
            c.execute("INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
                      (name, email, hashed))
            conn.commit()
            flash("Signup successful! Please login.", "success")
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            flash("Email already exists. Try logging in.", "danger")
        finally:
            conn.close()

    return render_template("signup.html")

def login():
    if request.method == 'POST':
        email = request.form['email'].strip().lower()
        password = request.form['password']
        conn = sqlite3.connect("fitness.db")
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE email=?", (email,))
        user = c.fetchone()
        conn.close()
        if user and check_password_hash(user[2], password):
            session['user_id'] = user
            session['user_name'] = user[1]
            return redirect(url_for('workout'))
        else:
            flash("Invalid credentials!", "danger")
    return render_template("login.html")


@app.route('/logout')
def logout():
    session.clear()
    flash("Logged out successfully.", "info")
    return redirect(url_for('login'))

@app.route('/workout', methods=['GET', 'POST'])
def workout():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    if request.method == 'POST':
        workout_type = request.form['workout_type']
        session['workout_type'] = workout_type
        return redirect(url_for('exercise', workout_type=session['workout_type']))

    return render_template("workout.html")

@app.route('/exercise/<workout_type>')
def exercise(workout_type):
    exercises = {
        "push": ["Push Ups", "Bench Press", "Shoulder Press"],
        "pull": ["Pull Ups", "Barbell Rows", "Deadlift"],
        "legs": ["Squats", "Lunges", "Leg Press"],
        "biceps_triceps": ["Bicep Curls", "Tricep Dips", "Hammer Curls"],
        "abs": ["Plank", "Crunches", "Leg Raises"]
    }
    return render_template("exercise.html", 
                           workout_type=workout_type, 
                           exercises=exercises.get(workout_type, []))

@app.route('/recommend')
def recommend():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    # Example static plan (can later be AI/ML-based)
    plan = {
        "Day 1": "Push - Bench Press, Push Ups, Shoulder Press",
        "Day 2": "Pull - Pull Ups, Rows, Deadlifts",
        "Day 3": "Legs - Squats, Lunges, Leg Press",
        "Day 4": "Arms - Bicep Curls, Tricep Dips, Hammer Curls",
        "Day 5": "Abs - Plank, Crunches, Leg Raises"
    }
    return render_template("recommend.html", plan=plan)

# ========== AI Pose Detection ==========
def calculate_angle(a, b, c):
    a, b, c = np.array(a), np.array(b), np.array(c)
    radians = np.arctan2(c[1] - b[1], c[0] - b[0]) - np.arctan2(a[1] - b[1], a[0] - b[0])
    angle = np.abs(radians * 180.0 / np.pi)
    if angle > 180.0:
        angle = 360 - angle
    return angle

@app.route('/start_camera')
def start_camera():
    mp_drawing = mp.solutions.drawing_utils
    mp_pose = mp.solutions.pose

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        return "Unable to open camera."

    counter = 0
    stage = None

    try:
        with mp_pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5) as pose:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                image.flags.writeable = False
                results = pose.process(image)

                image.flags.writeable = True
                image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

                if results.pose_landmarks:
                    landmarks = results.pose_landmarks.landmark
                    h, w = frame.shape[:2]

                    shoulder = [landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].x * w,
                                landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER.value].y * h]
                    elbow = [landmarks[mp_pose.PoseLandmark.LEFT_ELBOW.value].x * w,
                             landmarks[mp_pose.PoseLandmark.LEFT_ELBOW.value].y * h]
                    wrist = [landmarks[mp_pose.PoseLandmark.LEFT_WRIST.value].x * w,
                             landmarks[mp_pose.PoseLandmark.LEFT_WRIST.value].y * h]

                    angle = calculate_angle(shoulder, elbow, wrist)
                    cv2.putText(image, str(int(angle)), (int(elbow[0]), int(elbow[1])),
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2, cv2.LINE_AA)

                    if angle > 160:
                        stage = "down"
                    if angle < 30 and stage == 'down':
                        stage = "up"
                        counter += 1
                        print("Reps:", counter)

                    mp_drawing.draw_landmarks(image, results.pose_landmarks, mp_pose.POSE_CONNECTIONS)

                cv2.imshow('AI Trainer', image)

                if cv2.waitKey(10) & 0xFF == ord('q'):
                    break

    except Exception as e:
        print("Error during camera processing:", e)
    finally:
        cap.release()
        cv2.destroyAllWindows()

    return "Workout Session Ended!"

if __name__ == "__main__":
    app.run(debug=True)
