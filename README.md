# Hotel AI Concierge

An AI-powered hotel concierge web application that helps guests quickly access hotel services such as breakfast timings, WiFi details, taxi booking, pool timings, housekeeping requests, and more through a modern chat interface.

---

## Features

* AI-powered hotel concierge chatbot
* Modern responsive UI
* Dark mode / Light mode toggle
* Admin panel for updating hotel information
* Quick suggestion buttons
* Real-time knowledge updates
* Chat logging system
* Request logging system
* Pool timing scheduler
* Time picker inputs
* Vacation-themed sidebar UI
* Persistent hotel knowledge base using JSON
* Flask backend API

---

## Tech Stack

### Frontend

* HTML
* CSS
* JavaScript

### Backend

* Python
* Flask

### Storage

* JSON
* CSV Logs

---

# Project Structure

```bash id="95s39n"
hotel-concierge/
│
├── backend/
│   ├── app.py
│   ├── knowledge.json
│   ├── chat_log.csv
│   └── request_log.csv
│
├── frontend/
│   ├── index.html
│   ├── admin.html
│   └── style.css
│
├── requirements.txt
├── .env.example
├── .gitignore
└── README.md
```

---

# Main Functionalities

## Guest Chat Interface

Guests can:

* Ask hotel-related questions
* Request towels
* Ask for WiFi information
* View breakfast timings
* Check pool timings
* Request transportation
* Access hotel services instantly

---

## Admin Panel

Admins can:

* Update breakfast timings
* Update pool timings
* Update WiFi details
* Update check-in/check-out timings
* View update logs with timestamps
* Save hotel knowledge dynamically

---

# Screenshots

## Main Chat Interface

(Add screenshot here)

## Admin Dashboard

(Add screenshot here)

---

# Installation Guide

## 1. Clone Repository

```bash id="cg9q6k"
git clone https://github.com/yourusername/hotel-ai-concierge.git
```

---

## 2. Move Into Project Folder

```bash id="r1n86k"
cd hotel-ai-concierge
```

---

## 3. Create Virtual Environment

### Windows

```bash id="i1owdz"
python -m venv venv
```

Activate:

```bash id="2zot32"
venv\Scripts\activate
```

---

## 4. Install Requirements

```bash id="xjl6d6"
pip install -r requirements.txt
```

---

## 5. Add Environment Variables

Create a `.env` file inside the project root:

```env id="we49l5"
OPENAI_API_KEY=your_api_key_here
```

---

## 6. Run Backend

```bash id="e0x2ev"
cd backend
python app.py
```

---

## 7. Open Frontend

Open:

```bash id="p7y5oz"
frontend/index.html
```

in your browser.

---

# Future Improvements

* Voice assistant support
* Room service ordering
* Multi-language support
* Database integration
* Authentication system
* Cloud deployment
* AI sentiment analysis
* Live hotel booking integration

---

# Learning Outcomes

This project helped in understanding:

* Frontend-backend integration
* REST API development
* Flask routing
* JSON data management
* UI/UX design
* Git and GitHub workflows
* Environment variable security
* Logging systems

---

# Author

Irene Susan Jose and Ryan Mathew

---

# License
This project is for educational and portfolio purposes

This project is for educational and portfolio purposes.
