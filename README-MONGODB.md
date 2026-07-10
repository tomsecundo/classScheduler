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