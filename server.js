const calendarConfig = require('./calendarConfig');

const express = require('express');
const { google } = require('googleapis');
const session = require('express-session');
const app = express();

const CLIENT_ID = '663330082201-rj27f2rvfcc9oaciluc01l71hab3ur38.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

app.use(session({
  secret: 'calendar_secret',
  resave: false,
  saveUninitialized: true
}));

app.get('/', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly']
  });

  res.send(`<html>
    <body style="font-family: sans-serif; padding: 2rem;">
      <h1>Connect your Google Calendar</h1>
      <a href="${url}" style="font-size: 1.2rem; color: blue;">Authorize</a>
    </body>
  </html>`);
});

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  req.session.tokens = tokens;
  res.redirect('/calendars');
});

app.get('/calendars', async (req, res) => {
  if (!req.session.tokens) return res.redirect('/');
  oauth2Client.setCredentials(req.session.tokens);
  res.send(`<html>
    <body style="font-family: sans-serif; padding: 2rem;">
      <h1>Select a calendar to view events:</h1>
      <ul>
        <li><a href="/events?all=true">All Calendars</a></li>
        ${calendarConfig.map(c => `<li><a href="/events?calendarId=${c.id}">${c.summary}</a></li>`).join('')}
      </ul>
      <p><a href="/calendar-grid">📅 See Calendar Grid View</a></p>
    </body>
  </html>`);
});

app.get('/events', async (req, res) => {
  if (!req.session.tokens) {
    if (req.query.format === 'json') {
      return res.status(401).json({ error: 'Unauthorized. Please log in at / first.' });
    } else {
      return res.redirect('/');
    }
  }
    oauth2Client.setCredentials(req.session.tokens);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const { calendarId, all, start, end, keyword, format } = req.query;

  try {
    const events = [];

    const calList = all === 'true' ? calendarConfig :
                    calendarId ? [calendarConfig.find(c => c.id === calendarId)] : [];

    for (const cal of calList) {
      const result = await calendar.events.list({
        calendarId: cal.id,
        timeMin: start ? new Date(start).toISOString() : new Date().toISOString(),
        timeMax: end ? new Date(end).toISOString() : undefined,
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime'
      });

      result.data.items.forEach(event => {
        if (!keyword || (event.summary && event.summary.toLowerCase().includes(keyword.toLowerCase()))) {
          events.push({
            title: event.summary,
            start: event.start.dateTime || event.start.date,
            end: event.end?.dateTime || event.start.dateTime || event.start.date
          });
        }
      });
    }

    if (format === 'json') {
      return res.json(events);
    }

    res.send(`<html>
      <body style="font-family: sans-serif; padding: 2rem;">
        <h1>Events</h1>
        <ul>
          ${events.map(event => `<li>${event.title} — ${event.start}</li>`).join('')}
        </ul>
        <p><a href="/calendars">← Back to Calendars</a></p>
      </body>
    </html>`);
  } catch (err) {
    console.error(err);
    res.send('Error fetching events.');
  }
});

app.get('/calendar-grid', (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/main.min.css" rel="stylesheet" />
      </head>
      <body class="bg-gray-50 text-gray-900 font-sans p-10">
        <div class="max-w-6xl mx-auto bg-white p-6 rounded-lg shadow">
          <h1 class="text-2xl font-bold mb-4">Calendar Grid View</h1>
          <div id='calendar'></div>
          <p class="mt-4"><a href="/calendars" class="text-blue-600 underline">← Back to Calendar Picker</a></p>
        </div>

        <!-- Load FullCalendar script LAST -->
        <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.9/main.min.js"></script>
        <script>
          window.addEventListener('load', function () {
            fetch('/events?all=true&format=json')
              .then(res => res.json())
              .then(events => {
                var calendarEl = document.getElementById('calendar');
                var calendar = new FullCalendar.Calendar(calendarEl, {
                  initialView: 'dayGridMonth',
                  height: 'auto',
                  events: events
                });
                calendar.render();
              })
              .catch(error => {
                console.error('Error loading events:', error);
              });
          });
        </script>
      </body>
    </html>
  `);
});


app.listen(3000, () => console.log('🌍 App running at http://localhost:3000'));
