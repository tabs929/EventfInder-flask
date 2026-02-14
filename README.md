# Event Search Application

A web application for searching events using the Ticketmaster API.

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Configure API keys:
   - Copy `static/js/config.example.js` to `static/js/config.js`
   - Add your API keys:
     - IPInfo token from https://ipinfo.io/
     - Google Geocoding API key from Google Cloud Console

4. Run the application:
   ```bash
   python main.py
   ```

## Deployment

This application is configured for Google App Engine deployment using `app.yaml`.

## API Keys Required

- **IPInfo Token**: For automatic location detection
- **Google Geocoding API Key**: For manual location geocoding
- **Ticketmaster API**: Configure in the backend

⚠️ **Never commit your actual API keys to version control!**
