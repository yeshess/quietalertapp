import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("quietalert.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    timestamp_utc INTEGER,
    timestamp_local TEXT,
    location TEXT,
    type TEXT,
    category INTEGER
  );
  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    vibration_profile TEXT DEFAULT 'short',
    night_mode_enabled INTEGER DEFAULT 0,
    night_mode_start TEXT DEFAULT '23:00',
    night_mode_end TEXT DEFAULT '07:00',
    flashlight_enabled INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS user_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS all_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    value TEXT
  );
`);

// Seed default settings if not exists
const settingsCount = db.prepare("SELECT COUNT(*) as count FROM user_settings").get() as { count: number };
if (settingsCount.count === 0) {
  db.prepare("INSERT INTO user_settings (id) VALUES (1)").run();
}

// Migration: Add flashlight_enabled if it doesn't exist
try {
  db.prepare("SELECT flashlight_enabled FROM user_settings LIMIT 1").get();
} catch (e) {
  console.log("Adding flashlight_enabled column to user_settings...");
  db.prepare("ALTER TABLE user_settings ADD COLUMN flashlight_enabled INTEGER DEFAULT 0").run();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV });
  });

  // Fetch cities list from Oref
  const updateCitiesList = async () => {
    try {
      console.log("Fetching cities list from Oref...");
      const response = await axios.get("https://www.oref.org.il/Shared/Ajax/GetCities.aspx", {
        headers: {
          "Referer": "https://www.oref.org.il/",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        },
        timeout: 10000
      });
      
      let cities = [];
      if (Array.isArray(response.data)) {
        cities = response.data;
      } else if (typeof response.data === 'string') {
        try {
          cities = JSON.parse(response.data);
        } catch (e) {
          console.error("Failed to parse cities response as JSON");
        }
      }

      if (cities.length > 0) {
        const insert = db.prepare("INSERT OR IGNORE INTO all_locations (name, value) VALUES (?, ?)");
        const transaction = db.transaction((cityList) => {
          for (const city of cityList) {
            const name = city.label || city.name || city.Lable;
            const value = city.value || city.v;
            if (name) insert.run(name, value || name);
          }
        });
        transaction(cities);
        console.log(`Updated cities list: ${cities.length} cities loaded.`);
      } else {
        throw new Error("Empty cities list received");
      }
    } catch (error: any) {
      console.error("Error updating cities list:", error.message);
      
      // Fallback to major cities if API fails
      console.log("Seeding fallback cities...");
      const fallbackCities = [
        "Tel Aviv - Yafo", "Jerusalem", "Haifa", "Rishon LeZion", "Petah Tikva", 
        "Ashdod", "Netanya", "Beer Sheva", "Bnei Brak", "Holon", "Ramat Gan", 
        "Rehovot", "Ashkelon", "Bat Yam", "Beit Shemesh", "Kfar Saba", "Herzliya", 
        "Hadera", "Modi'in-Maccabim-Re'ut", "Nazareth", "Lod", "Ramla", "Ra'anana", 
        "Rahat", "Hod HaSharon", "Giv'atayim", "Kiryat Ata", "Nahariya", "Umm al-Fahm", 
        "Kiryat Gat", "Eilat", "Acre", "Karmiel", "Tiberias", "Sderot", "Kiryat Shmona"
      ];
      
      const insert = db.prepare("INSERT OR IGNORE INTO all_locations (name, value) VALUES (?, ?)");
      const transaction = db.transaction((cityNames) => {
        for (const name of cityNames) {
          insert.run(name, name);
        }
      });
      transaction(fallbackCities);
    }
  };

  updateCitiesList();

  // API Routes
  app.get("/api/locations/all", (req, res) => {
    let locations = db.prepare("SELECT name FROM all_locations ORDER BY name ASC").all();
    
    // If empty, return a minimal fallback immediately so the UI isn't broken
    if (locations.length === 0) {
      return res.json([
        { name: "Tel Aviv - Yafo" }, { name: "Jerusalem" }, { name: "Haifa" }, 
        { name: "Beer Sheva" }, { name: "Ashdod" }, { name: "Netanya" }, 
        { name: "Rishon LeZion" }, { name: "Petah Tikva" }, { name: "Holon" }
      ]);
    }
    
    res.json(locations);
  });

  app.get("/api/alerts", (req, res) => {
    const hours = 3;
    const since = Date.now() - hours * 60 * 60 * 1000;
    const alerts = db.prepare("SELECT * FROM alerts WHERE timestamp_utc > ? ORDER BY timestamp_utc DESC").all(since);
    res.json(alerts);
  });

  app.get("/api/summary", (req, res) => {
    const lastAlert = db.prepare("SELECT * FROM alerts ORDER BY timestamp_utc DESC LIMIT 1").get();
    const count3h = db.prepare("SELECT COUNT(*) as count FROM alerts WHERE timestamp_utc > ?").get(Date.now() - 3 * 60 * 60 * 1000) as { count: number };
    
    res.json({
      lastAlert,
      count3h: count3h.count
    });
  });

  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM user_settings WHERE id = 1").get();
    const locations = db.prepare("SELECT * FROM user_locations").all();
    res.json({ settings, locations });
  });

  app.post("/api/settings", (req, res) => {
    const { vibration_profile, night_mode_enabled, night_mode_start, night_mode_end, flashlight_enabled } = req.body;
    db.prepare(`
      UPDATE user_settings 
      SET vibration_profile = ?, night_mode_enabled = ?, night_mode_start = ?, night_mode_end = ?, flashlight_enabled = ? 
      WHERE id = 1
    `).run(vibration_profile, night_mode_enabled ? 1 : 0, night_mode_start, night_mode_end, flashlight_enabled ? 1 : 0);
    res.json({ success: true });
  });

  app.post("/api/locations", (req, res) => {
    const { name } = req.body;
    try {
      db.prepare("INSERT INTO user_locations (name) VALUES (?)").run(name);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: "Location already exists" });
    }
  });

  app.delete("/api/locations/:name", (req, res) => {
    db.prepare("DELETE FROM user_locations WHERE name = ?").run(req.params.name);
    res.json({ success: true });
  });

  // Oref Alert Polling (Current)
  const pollOref = async () => {
    try {
      const response = await axios.get("https://www.oref.org.il/WarningMessages/alert/alerts.json", {
        headers: {
          "Referer": "https://www.oref.org.il/",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9,he;q=0.8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        },
        timeout: 5000,
        responseType: 'arraybuffer'
      });

      if (response && response.data) {
        let dataStr = Buffer.from(response.data).toString('utf8');
        if (dataStr.charCodeAt(0) === 0xFEFF) dataStr = dataStr.slice(1);

        if (dataStr.trim()) {
          const alertData = JSON.parse(dataStr);
          if (alertData && alertData.data) {
            const { data, title, id } = alertData;
            data.forEach((loc: string) => {
              const timestamp = Date.now();
              db.prepare(`
                INSERT OR IGNORE INTO alerts (id, timestamp_utc, timestamp_local, location, type, category)
                VALUES (?, ?, ?, ?, ?, ?)
              `).run(`${id}-${loc}`, timestamp, new Date().toLocaleString(), loc, title, alertData.cat || 1);
            });
          }
        }
      }
    } catch (error: any) {
      if (error.response && error.response.status === 403) {
        console.warn("Oref API returned 403 Forbidden.");
      } else if (error.code !== 'ECONNABORTED') {
        console.error("Error polling Oref:", error.message);
      }
    }
  };

  // Oref Alert History Polling
  const pollHistory = async () => {
    try {
      console.log("Polling Oref History...");
      const response = await axios.get("https://www.oref.org.il/WarningMessages/History/AlertsHistory.json", {
        headers: {
          "Referer": "https://www.oref.org.il/",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        },
        timeout: 10000
      });

      if (response && response.data && Array.isArray(response.data)) {
        const insert = db.prepare(`
          INSERT OR IGNORE INTO alerts (id, timestamp_utc, timestamp_local, location, type, category)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        let added = 0;
        const transaction = db.transaction((alerts) => {
          for (const alert of alerts) {
            const dateStr = alert.alertDate || alert.datetime;
            if (!dateStr) continue;

            // Oref dates are Israel time. We'll try to parse them.
            // If it's "2024-03-11 14:20:00", we'll assume it's local to the user's expectation.
            // For the database, we'll store it as a timestamp.
            const date = new Date(dateStr.replace(/-/g, '/')); // Better compatibility
            const timestamp = date.getTime();
            const loc = alert.data;
            const type = alert.title;
            const category = alert.category || 1;
            const id = `hist-${timestamp}-${loc}-${type}`;
            
            const result = insert.run(id, timestamp, dateStr, loc, type, category);
            if (result.changes > 0) added++;
          }
        });
        transaction(response.data);
        console.log(`History poll complete. Added ${added} new alerts. Total in history response: ${response.data.length}`);
      }
    } catch (error: any) {
      console.error("Error polling Oref History:", error.message);
    }
  };

  // Mock Alert Generator for Dev Mode
  const generateMockAlert = () => {
    const locations = ["Tel Aviv", "Haifa", "Jerusalem", "Ashdod", "Be'er Sheva"];
    const types = ["Rocket Fire", "UAV Infiltration", "Hostile Aircraft"];
    const loc = locations[Math.floor(Math.random() * locations.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const id = Date.now().toString();
    
    db.prepare(`
      INSERT OR IGNORE INTO alerts (id, timestamp_utc, timestamp_local, location, type, category)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, Date.now(), new Date().toLocaleString(), loc, type, 1);
    
    console.log(`Mock alert generated: ${loc} - ${type}`);
  };

  app.post("/api/mock-alert", (req, res) => {
    generateMockAlert();
    res.json({ success: true });
  });

  // Poll every 10 seconds for current, every 5 minutes for history
  setInterval(pollOref, 10000);
  setInterval(pollHistory, 300000);
  
  // Initial polls
  pollOref();
  pollHistory();
  
  app.get("/manifest.json", (req, res) => {
    res.sendFile(path.join(process.cwd(), "manifest.json"));
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    console.log(`Serving static files from ${distPath}`);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Clear very old alerts periodically (e.g., older than 24h)
  setInterval(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    db.prepare("DELETE FROM alerts WHERE timestamp_utc < ?").run(dayAgo);
  }, 3600000);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
