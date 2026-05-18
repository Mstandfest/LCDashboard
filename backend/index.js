const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');
const { parseRaidString } = require('./parser');

// Konfiguration laden
dotenv.config();
const app = express();
const PORT = process.env.PORT || 8022;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// MySQL Connection Pool Setup
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'unleashed_loot',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- API ROUTES ---

/*
Public: Holt die Attendance-Daten für das Dashboard
 */
app.get('/api/attendance', async (req, res) => {
    try {
        // 2 Tage vom raid_date abziehen, damit Mittwoch (Tag 3) für die Funktion wie ein Montag (Tag 1) behandelt wird.
        const [rows] = await pool.query(`
            SELECT 
                p.name, 
                p.class,
                SUM(a.bosses_attended) as total_attended,
                (SELECT SUM(max_bosses) FROM (
                    SELECT MAX(total_bosses) as max_bosses 
                    FROM raids 
                    GROUP BY instance_name, YEARWEEK(DATE_SUB(raid_date, INTERVAL 2 DAY), 1)
                ) as weekly_max) as total_possible,
                ROUND((SUM(a.bosses_attended) / (
                    SELECT SUM(max_bosses) FROM (
                        SELECT MAX(total_bosses) as max_bosses 
                        FROM raids 
                        GROUP BY instance_name, YEARWEEK(DATE_SUB(raid_date, INTERVAL 2 DAY), 1)
                    ) as weekly_max
                )) * 100, 1) as attendance_rate
            FROM players p
            LEFT JOIN attendance a ON p.id = a.player_id
            LEFT JOIN raids r ON a.raid_id = r.id
            WHERE p.is_active = 1
            GROUP BY p.id
            ORDER BY attendance_rate DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send("Serverfehler");
    }
});

// Raid-Historie abrufen (Public)
app.get('/api/raids', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, instance_name, raid_date, total_bosses 
            FROM raids 
            ORDER BY raid_date DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Fehler bei Raid-Abfrage" });
    }
});

// Loot-Historie abrufen (Public)
app.get('/api/loot', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT p.name, p.class, l.item_id, r.raid_date, r.instance_name
            FROM loot_history l
            JOIN players p ON l.player_id = p.id
            JOIN raids r ON l.raid_id = r.id
            ORDER BY r.raid_date DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Fehler bei Loot-Abfrage" });
    }
});

// Route für die Verarbeitung vom Addon-String (Admin)
app.post('/api/admin/ingest', async (req, res) => {
    const { raidString } = req.body;
    const adminToken = req.headers['x-admin-token'];

    // 1. Token-Check
    if (adminToken !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ error: "Nicht autorisiert!" });
    }

    const connection = await pool.getConnection();
    try {
        // 2. String parsen
        const parsedData = parseRaidString(raidString);
        
        await connection.beginTransaction();

        // 3. Dubletten-Check (Raid bereits vorhanden?)
        const [existingRaid] = await connection.query(
            'SELECT id FROM raids WHERE raid_date = ? AND instance_name = ?',
            [parsedData.raidData.date, parsedData.raidData.instance]
        );

        if (existingRaid.length > 0) {
            throw new Error("Dieser Raid wurde bereits importiert.");
        }

        // 4. Raid anlegen
        const [raidResult] = await connection.query(
            'INSERT INTO raids (instance_name, raid_date, total_bosses) VALUES (?, ?, ?)',
            [parsedData.raidData.instance, parsedData.raidData.date, parsedData.raidData.totalBosses]
        );
        const raidId = raidResult.insertId;

        // 5. Spieler & Attendance verarbeiten
        for (const playerObj of parsedData.players) {
            const { name, className } = playerObj;

            // Upsert-Logik: Einfügen oder Klasse aktualisieren
            await connection.query(`
                INSERT INTO players (name, class, is_active) 
                VALUES (?, ?, 1) 
                ON DUPLICATE KEY UPDATE class = VALUES(class)
            `, [name, className]);

            // Spieler-ID für die Attendance-Tabelle
            const [playerRow] = await connection.query('SELECT id FROM players WHERE name = ?', [name]);
            const playerId = playerRow[0].id;

            // Attendance eintragen
            const bossesAttended = parsedData.attendance[name] || 0;
            await connection.query(
                'INSERT INTO attendance (player_id, raid_id, bosses_attended) VALUES (?, ?, ?)',
                [playerId, raidId, bossesAttended]
            );
        }

        // 6. Loot eintragen
        for (const item of parsedData.loot) {
            const [playerRow] = await connection.query('SELECT id FROM players WHERE name = ?', [item.winner]);
            if (playerRow.length > 0) {
                await connection.query(
                    'INSERT INTO loot_history (player_id, raid_id, item_id) VALUES (?, ?, ?)',
                    [playerRow[0].id, raidId, item.itemId]
                );
            }
        }

        await connection.commit();
        res.json({ message: "Raid erfolgreich importiert!", raidId });

    } catch (err) {
        await connection.rollback();
        console.error("Fehler beim Ingest:", err.message);
        res.status(400).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// Server starten
app.listen(PORT, () => {
    console.log(`🚀 Unleashed Backend läuft auf http://localhost:${PORT}`);
});
