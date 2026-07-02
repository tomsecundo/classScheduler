# Class Scheduler with MongoDB Collaboration

This version keeps the original offline behavior, but it is also ready to sync with a MongoDB-backed server so multiple colleagues can collaborate from different computers.

## What changed

- Added a **MongoDB Server Sync** panel in the right-side control panel.
- Added a Node.js/Express API server in the `server/` folder.
- Added MongoDB storage for the shared scheduler data.
- Added optimistic revision checking to avoid silent overwrites when two users edit at the same time.
- Weekly section, teacher, and room calendar views can also save edits back to the server when sync is enabled.

## Folder structure

```text
class-scheduler/
├── index.html
├── style.css
├── app.js
├── weekly.html
├── weekly.css
├── weekly.js
├── README-MONGODB.md
└── server/
    ├── package.json
    ├── server.js
    └── .env.example
```

## Local setup

### 1. Install Node.js and MongoDB

Install Node.js and either a local MongoDB server or use MongoDB Atlas.

### 2. Configure the server

Open the `server` folder, copy `.env.example`, and rename the copy to `.env`.

For local MongoDB, this is enough:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/class_scheduler
PORT=3000
SCHOOL_ID=default-school
CORS_ORIGIN=*
```

For MongoDB Atlas, replace `MONGODB_URI` with your Atlas connection string.

### 3. Install server packages

From inside the `server` folder, run:

```bash
npm install
```

### 4. Start the server

```bash
npm start
```

Then open this in the browser:

```text
http://localhost:3000
```

## Collaboration setup

On each colleague's computer:

1. Open the scheduler website served by the Node server.
2. Go to **MongoDB Server Sync**.
3. Check **Enable server sync**.
4. Set API Base URL to:
   - `http://localhost:3000` if using the same computer, or
   - `http://SERVER-IP-ADDRESS:3000` if accessing from another computer on the same network.
5. Click **Save Sync Settings**.
6. Use **Pull** to load the latest shared schedule.
7. Use **Push** to force upload the current browser copy when needed.

## Important deployment notes

This starter server does not include login/accounts yet. For real school deployment, add authentication before exposing it on the internet. A practical production setup should include:

- User login
- Role-based permissions
- HTTPS
- Server-side conflict validation
- Automated database backup
- Audit logs for who changed the schedule


## Fixed activities and protected slots

This version also supports fixed protected blocks such as lunch breaks, flag ceremony, and flag retreat.

- Use **Fixed Activities & Lunch** in the right-side control panel.
- Select one or more days and several sections at once.
- Use the section filter, for example `Grade 7`, to quickly select a grade level.
- Fixed activities appear in the master schedule and section weekly calendar.
- Manual scheduling and drag-and-drop editing cannot overlap protected blocks.
- Auto Generate Week preserves fixed activities and skips those time slots automatically.

Suggested workflow:

1. Add all sections first.
2. Create lunch breaks by grade level using the section filter.
3. Add Flag Ceremony on Monday morning for all sections.
4. Add Flag Retreat on Friday afternoon for all sections.
5. Add teaching loads.
6. Click **Auto Generate Week**.


## UI Update

The right sidebar is now a compact control launcher. Sections, Subjects, Teachers, Rooms, Teaching Loads, Fixed Activities/Lunch, School Day Settings, and MongoDB Sync open in focused dialogs. Dashboard count cards show scheduled classes, teachers, students, subjects, and rooms. Lists are rendered alphabetically for easier review.

## Teacher official start time

Teachers now have an **Official Start** field when added in the Teachers dialog. Existing teacher records are automatically treated as starting at the school day start time unless a different start time is set.

Scheduling rules:

- Manual scheduling blocks a teacher from being assigned before their official start time.
- Drag-and-drop weekly calendar edits also apply the same rule.
- Auto Generate Week skips time slots before the assigned teacher's official start time.
- Auto Generate Week prioritizes teaching loads for teachers with earlier official start times, so teachers who start at 7:30 AM are considered first for the earliest available slots.

## Day-specific time slots

The scheduler now supports different teaching start times per day. This is useful when Monday has a short fixed activity before regular classes.

Recommended Monday setup:

1. Open **School Day Settings**.
2. Keep **School Day Start** as `07:30`.
3. Set **Monday Teaching Start** to `07:50`.
4. Keep Tuesday to Friday teaching starts at `07:30`, or adjust as needed.
5. Open **Lunch / Fixed Activities**.
6. Use the **Flag Ceremony** preset or create a fixed activity:
   - Activity: `Flag Ceremony`
   - Day: Monday
   - Start: `07:30`
   - Duration: `20`
   - Apply to selected sections

Auto Generate will use the day-specific teaching starts, so Monday classes begin at 7:50 AM while the 7:30–7:50 AM flag ceremony remains protected.


## Weekly calendar with Monday-specific slots

The weekly calendar view now uses a split time layout:

- **Monday Time** and **Monday** use the Monday-specific pattern, such as `07:30–07:50` for Flag Ceremony and `07:50–08:40` for the first Monday class.
- **Tue-Fri Time** is shown after the Monday column and is shared by Tuesday, Wednesday, Thursday, and Friday.
- Empty non-matching time cells stay blank, so the calendar no longer shows unnecessary “Not a teaching slot” placeholders.

Recommended fixed flag blocks:

- **Flag Ceremony**: Monday, `07:30`, duration `20` minutes.
- **Flag Retreat**: Friday, `15:00`, duration `50` minutes.

Use the Flag Ceremony and Flag Retreat presets inside **Fixed Activities / Lunch**, select the affected sections, then click **Add Fixed Activity**.

## Latest Export and Navigation Features

- **Export Weekly XLSX** creates one spreadsheet file containing all section weekly schedules in a timetable-style table.
- **Export iCal** is available inside each weekly calendar view. The exported `.ics` file can be imported into Google Calendar, iOS Calendar, or macOS Calendar. Events are exported as weekly recurring events for 40 occurrences.
- **Browse Section Schedules** opens a weekly calendar browser with a dropdown of all sections.
- **Browse Teacher Schedules** opens a weekly calendar browser with a dropdown of all teachers.
