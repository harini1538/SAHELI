Saheli – Women Empowerment Platform
Project Link

Live URL: https://youtu.be/yo6FoSgSLKo?si=2LcY-VPs9QLOnDEK

Project Overview

Saheli is a voice-enabled digital platform designed to empower women by providing access to opportunities, skill development resources, safety features, and community support.

The platform primarily focuses on women in rural and semi-urban areas who face challenges in accessing information, digital tools, and support systems. By combining AI assistance with a simple and accessible interface, Saheli enables users to learn, grow, and become independent.

Problem Statement

Many women encounter the following challenges:

Lack of awareness about government schemes and job opportunities
Limited digital literacy and confidence in using technology
Absence of safe and reliable support systems
Difficulty accessing financial knowledge and entrepreneurial guidance

Saheli addresses these issues through a centralized, easy-to-use, and voice-first platform.
Core Features
AI Voice Assistant

The platform includes an intelligent voice-enabled assistant designed to make navigation simple and accessible for all users, including those with limited literacy. It supports regional languages, allowing users to interact naturally through speech. The assistant provides real-time guidance on government schemes, skill development opportunities, safety resources, and general platform usage, ensuring users can access information without needing advanced technical knowledge.

Digital Literacy Simulator

This module is designed to help first-time users become comfortable with smartphones and the internet. It offers interactive, step-by-step learning experiences that simulate real-world digital tasks such as using apps, browsing, and online communication. The interface is simplified and intuitive, enabling users to build confidence in using digital tools independently.

Government Scheme Hub

The Government Scheme Hub provides a centralized repository of verified government programs relevant to women. Each scheme is presented with simplified explanations to improve understanding, along with eligibility criteria and direct application links. This feature reduces the gap between awareness and access, making it easier for users to benefit from available opportunities.

Skill Development Hub

This module offers curated learning resources aimed at improving employability and encouraging entrepreneurship. It includes courses and training materials related to job readiness, freelancing, and small business development. Structured learning paths help users progress systematically, enabling them to acquire practical skills and generate income opportunities.

Community Support System

Saheli provides a safe and moderated community space where users can connect, share experiences, and support each other. The platform encourages peer learning, collaboration, and emotional support while maintaining user safety through moderation. This feature helps build a sense of belonging and reduces isolation.

Safety and Emergency Module

The safety module is designed to ensure user security through quick and reliable access to emergency features. It includes an SOS alert system that can share the user’s location with trusted contacts, along with access to important helplines. The module also provides safety awareness resources, helping users stay informed and prepared in critical situations.

Business Starter Toolkit

This feature supports women who wish to start and manage their own businesses. It provides step-by-step guidance on setting up small enterprises, including planning, budgeting, and basic financial management. The toolkit is designed to simplify the process of entrepreneurship and encourage self-employment.

Confidence Tracker

The Confidence Tracker monitors user progress across different activities within the platform. It highlights achievements, tracks learning milestones, and motivates users to continue improving. By providing visible indicators of growth, this feature helps build self-confidence and encourages long-term engagement.

System Architecture
User (Voice/Text)
        ↓
Frontend (React)
        ↓
Backend (Flask / FastAPI)
        ↓
AI Assistant (Groq API)
        ↓
Database (MySQL / Firebase)
        ↓
External Services (Govt APIs, Maps, Speech APIs)

Technology Stack
Layer	Technology: Frontend	React, Tailwind CSS
Backend	: Flask / FastAPI , AI / LLM	Groq API , Speech	, SpeechRecognition, gTTS
Database:	MySQL / Firebase

Installation and Setup
Prerequisites
Node.js (v16 or higher)
npm or yarn
Python 3.12

Backend Setup
cd backend
pip install -r requirements.txt
python app.py
Frontend Setup
cd frontend
npm install
npm run dev
Run the Application

Open your browser and navigate to:

http://localhost:5173
Environment Variables

Create a .env file in the backend directory:

GROQ_API_KEY=*****
Usage
Launch the application in a browser
Use voice or text input to interact with the assistant
Navigate through features such as schemes, skills, and safety tools
Deployment

Frontend: Vercel or Netlify
Backend: Render or Railway

Future Enhancements
Multi-language support expansion
AI-based personalized recommendations
Offline functionality for low-connectivity areas
Mentor–mentee system
Integration with real-time government databases
Contribution
Fork the repository
Create a feature branch
Commit your changes
Push to your branch
Submit a pull request

License
This project is licensed under the MIT License.

Author

Harini M
Full Stack Developer
AI Enthusiast

Vision
Empowering women through accessible technology, knowledge, and support.
