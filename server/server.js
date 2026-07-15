require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI;
const SCHOOL_ID = process.env.SCHOOL_ID || 'default-school';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const defaultData = {
  settings: { dayStart: '07:30', dayEnd: '16:30', slotDuration: 50 },
  sections: [],
  subjects: [],
  teachers: [],
  rooms: [],
  teachingLoads: [],
  schedules: []
};

const schedulerSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, unique: true, index: true },
    revision: { type: Number, default: 0 },
    data: { type: mongoose.Schema.Types.Mixed, default: defaultData }
  },
  { timestamps: true, minimize: false }
);

const SchedulerDocument = mongoose.model('SchedulerDocument', schedulerSchema);

function normalizeData(source = {}) {
  return {
    ...defaultData,
    ...source,
    settings: { ...defaultData.settings, ...(source.settings || {}) },
    sections: Array.isArray(source.sections) ? source.sections : [],
    subjects: Array.isArray(source.subjects) ? source.subjects : [],
    teachers: Array.isArray(source.teachers) ? source.teachers : [],
    rooms: Array.isArray(source.rooms) ? source.rooms : [],
    teachingLoads: Array.isArray(source.teachingLoads) ? source.teachingLoads : [],
    fixedActivities: Array.isArray(source.fixedActivities) ? source.fixedActivities : [],
    schedules: Array.isArray(source.schedules) ? source.schedules : [],
    scheduleWaitlist: Array.isArray(source.scheduleWaitlist) ? source.scheduleWaitlist : [],
    generatorRun: Number(source.generatorRun || 0)
  };
}

async function getSchedulerDocument() {
  let doc = await SchedulerDocument.findOne({ schoolId: SCHOOL_ID });
  if (!doc) {
    doc = await SchedulerDocument.create({ schoolId: SCHOOL_ID, revision: 0, data: defaultData });
  }
  return doc;
}

async function main() {
  if (!MONGODB_URI) {
    throw new Error('Missing MONGODB_URI. Copy .env.example to .env and add your MongoDB connection string.');
  }

  await mongoose.connect(MONGODB_URI);

  const app = express();
  app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',').map(item => item.trim()) }));
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', async (_req, res) => {
    res.json({ ok: true, database: mongoose.connection.readyState === 1 ? 'connected' : 'not-connected', schoolId: SCHOOL_ID });
  });

  app.get('/api/scheduler', async (_req, res, next) => {
    try {
      const doc = await getSchedulerDocument();
      res.json({ data: normalizeData(doc.data), revision: doc.revision, updatedAt: doc.updatedAt });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/scheduler', async (req, res, next) => {
    try {
      const incomingData = normalizeData(req.body?.data);
      const expectedRevision = req.body?.expectedRevision;
      const doc = await getSchedulerDocument();

      if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== Number(doc.revision)) {
        return res.status(409).json({
          message: 'Schedule was changed by another user. Pull the latest copy before saving again.',
          data: normalizeData(doc.data),
          revision: doc.revision,
          updatedAt: doc.updatedAt
        });
      }

      doc.data = incomingData;
      doc.revision = Number(doc.revision || 0) + 1;
      await doc.save();

      res.json({ data: normalizeData(doc.data), revision: doc.revision, updatedAt: doc.updatedAt });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/scheduler/generated-schedule', async (req, res, next) => {
    try {
      const schedules = Array.isArray(req.body?.schedules) ? req.body.schedules : [];
      const scheduleWaitlist = Array.isArray(req.body?.scheduleWaitlist) ? req.body.scheduleWaitlist : [];
      const generatorRun = Number(req.body?.generatorRun || 0);
      const expectedRevision = req.body?.expectedRevision;
      const doc = await getSchedulerDocument();

      if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== Number(doc.revision)) {
        return res.status(409).json({
          message: 'Scheduler data changed while the generated schedule was being saved.',
          data: normalizeData(doc.data),
          revision: doc.revision,
          updatedAt: doc.updatedAt
        });
      }

      const nextData = normalizeData(doc.data);
      nextData.schedules = schedules;
      nextData.scheduleWaitlist = scheduleWaitlist;
      nextData.generatorRun = generatorRun;
      doc.data = nextData;
      doc.revision = Number(doc.revision || 0) + 1;
      await doc.save();

      res.json({ data: normalizeData(doc.data), revision: doc.revision, updatedAt: doc.updatedAt });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/scheduler/reset', async (_req, res, next) => {
    try {
      const doc = await getSchedulerDocument();
      doc.data = defaultData;
      doc.revision = Number(doc.revision || 0) + 1;
      await doc.save();
      res.json({ data: normalizeData(doc.data), revision: doc.revision, updatedAt: doc.updatedAt });
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(path.join(__dirname, '..')));

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ message: error.message || 'Server error.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Class Scheduler server running at http://localhost:${PORT}`);
    console.log(`MongoDB school document: ${SCHOOL_ID}`);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
