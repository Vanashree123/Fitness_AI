# Fitness_AI: AI-Powered Fitness Web App

An all-in-one fitness web app featuring a smart assistant that understands your goals, provides personalized workouts and meal suggestions, and gives real-time posture feedback using MediaPipe, with rep counting and program management. Secure, responsive, and ready for real-world use.

---

##  Features

-  **Conversational AI Assistant** – Talks to users about fitness goals, physical conditions, and preferences  
-  **Workout Plans** – Personalized routines based on user profile  
-  **Diet Recommendations** – Meal plans tailored to allergies and preferences  
-  **Real-Time Posture Correction** – Uses MediaPipe for posture feedback and rep counting  
-  **Program Management** – Create, view, and manage multiple fitness programs (only the latest is "active")  
-  **Authentication** – Sign in via Google or email/password  
-  **User-Friendly UI** – Fully responsive & modern web interface  

---

##  Repository Structure

Fitness_AI/
├── ai_posture.py # Python code for posture analysis
├── pose_client.js # Frontend logic for MediaPipe integration
├── app.py # Main Flask (or similar) application entry
├── models.py # Data models for user, sessions, programs
├── fitness.db # SQLite DB for local storage
├── style.css # Styles for UI
├── requirements.txt # Python dependencies
└── templates/ # HTML templates for UI

markdown
Copy code

- `ai_posture.py`: Core logic for posture detection using MediaPipe  
- `pose_client.js`: Client-side JS to interface webcam and send data for analysis  
- `app.py`: Backend interface—API endpoints, routing, and integration  
- `models.py`: Defines your ORM models (e.g., users, programs, sessions)  
- `templates/`: HTML pages for UI front-end (likely Jinja for Flask)  

---

##  Installation & Setup

1. **Clone the repo**  
   ```bash
   git clone https://github.com/Vanashree123/Fitness_AI.git
   cd Fitness_AI
Install Python dependencies

bash
Copy code
pip install -r requirements.txt
Run the app

bash
Copy code
python app.py
Visit in your browser
Open http://localhost:5000 to view and use the app.

Usage Notes
Use the AI assistant to input your fitness goals, preferences, and restrictions.

Create workout programs and track exercises directly in the dashboard.

The MediaPipe-powered posture monitor uses your webcam, giving real-time feedback and counting reps.

Real-time UI feedback and session history give insights into your performance.

Tech Stack
Area	Technology
Backend & API	Python (Flask / FastAPI likely)
ML & Vision	MediaPipe for posture detection
Frontend Interactions	JavaScript (pose_client.js)
Storage	SQLite (fitness.db)
Templates & UI	HTML/CSS (Jinja2 templates)
Styling	style.css

Contributing
Contributions are welcome! Here’s how you can help:

Fork the repository

Create a new branch:

bash
Copy code
git checkout -b feature/my-new-feature
Make your changes and commit them:

bash
Copy code
git commit -m "Your message explaining changes"
Push to your fork:

bash
Copy code
git push origin feature/my-new-feature
Open a Pull Request — I’d love to review!
