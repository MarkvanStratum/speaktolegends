//--------------------------------------------
//	SERVER.JS — BIBLICAL AI CHAT EDITION (WITH CHARMR CHAT LOGIC)
//--------------------------------------------

import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pkg from "pg";
import Stripe from "stripe";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";
import multer from "multer";
import { handleCreateIntent } from "./payments.js";


//--------------------------------------------
//	BASIC SETUP
//--------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecret";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

app.use(cors());
app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error("Webhook Signature Error:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("🔥 WEBHOOK RECEIVED:", event.type);

    if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object;

        const plan = paymentIntent.metadata?.plan;
        const email = paymentIntent.metadata?.email;
        const userId = paymentIntent.metadata?.userId 
            ? parseInt(paymentIntent.metadata.userId) 
            : null;

        console.log("💳 payment_intent.succeeded", { plan, email, userId });

        let expiresAt = null;
        let isLifetime = false;

        if (plan === "god" || plan === "all") {
            const date = new Date();
            date.setDate(date.getDate() + 30);
            expiresAt = date;
        } else if (plan === "lifetime") {
            isLifetime = true;
        }

        try {
            if (userId) {
                await pool.query(
                    "UPDATE users SET plan = $1, expires_at = $2, lifetime = $3, messages_sent = 0 WHERE id = $4",
                    [plan, expiresAt, isLifetime, userId]
                );
            } else if (email) {
                await pool.query(
                    "UPDATE users SET plan = $1, expires_at = $2, lifetime = $3, messages_sent = 0 WHERE email = $4",
                    [plan, expiresAt, isLifetime, email]
                );
            }

            console.log("✅ USER UPDATED SUCCESSFULLY");
        } catch (err) {
            console.error("❌ DB UPDATE FAILED:", err);
        }
    }

    res.json({ received: true });
});
// JSON parser FIRST
app.use(express.json());


// THEN routes
app.post("/api/create-landing-payment", handleCreateIntent);
app.post("/api/create-au-payment-3595", handleCreateIntent);
app.post("/api/create-payment-2995", handleCreateIntent);

//--------------------------------------------
//	DATABASE
//--------------------------------------------

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Add this to verify the connection in your terminal
pool.connect((err) => {
  if (err) {
    console.error("❌ Database connection failed:", err.stack);
  } else {
    console.log("✅ Connected to PostgreSQL database");
  }
});// Initialize essential DB tables
(async () => {
	try {
		await pool.query(`
			CREATE TABLE IF NOT EXISTS users (
				id SERIAL PRIMARY KEY,
				email TEXT UNIQUE NOT NULL,
				password TEXT NOT NULL,
				credits INT DEFAULT 10,
				lifetime BOOLEAN DEFAULT false,
				reset_token TEXT,
				reset_token_expires TIMESTAMP,
				plan TEXT DEFAULT 'free',
				expires_at TIMESTAMP,
				messages_sent INT DEFAULT 0
			);
		`);

		await pool.query(`
			CREATE TABLE IF NOT EXISTS messages (
				id SERIAL PRIMARY KEY,
				user_id INT REFERENCES users(id) ON DELETE CASCADE,
				character_id INT NOT NULL,
				from_user BOOLEAN NOT NULL,
				text TEXT NOT NULL,
				created_at TIMESTAMP DEFAULT NOW()
			);
		`);

		console.log("✅ Database ready");
		await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';`);
		await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;`);
		await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime BOOLEAN DEFAULT false;`);
		await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS messages_sent INT DEFAULT 0;`);
	} catch (err) {
		console.error("❌ DB Init error:", err);
	}
})();

//--------------------------------------------
//	BIBLICAL CHARACTER PROFILES
//--------------------------------------------

export const historicalProfiles = [
	{ id: 1, name: "Albert Einstein", image: "/img/einstein.jpg", description: "Theoretical physicist. Speak with humility, curiosity, and a gentle wit. Use simple thought experiments to explain complex physics." },
	{ id: 2, name: "Julius Caesar", image: "/img/caesar.jpg", description: "Roman Dictator. Speak with authority and strategic brilliance. Reference the glory of Rome." },
	{ id: 3, name: "Marie Curie", image: "/img/curie.jpg", description: "Scientist. Speak with intense focus and perseverance. Reference radioactivity and discovery." },
	{ id: 4, name: "Napoleon Bonaparte", image: "/img/napoleon.jpg", description: "Emperor. Speak in short, decisive sentences with a tactical mind." },
	{ id: 5, name: "Socrates", image: "/img/socrates.jpg", description: "Philosopher. Answer with probing questions (the Socratic method) to lead the user to their own truth." },
	{ id: 6, name: "Ada Lovelace", image: "/img/lovelace.jpg", description: "First programmer. Speak as a 'Poetical Scientist' who sees the beauty in mathematics." },
	{ id: 7, name: "Leonardo da Vinci", image: "/img/davinci.jpg", description: "Polymath. Speak with curiosity about anatomy, flight, and art." },
	{ id: 8, name: "Cleopatra VII", image: "/img/cleopatra.jpg", description: "Queen of Egypt. Speak with regal grace and sharp intelligence." },
	{ id: 9, name: "Isaac Newton", image: "/img/newton.jpg", description: "Physicist. Speak with intensity about the laws of nature and gravity." },
	{ id: 10, name: "Marcus Aurelius", image: "/img/aurelius.jpg", description: "Stoic Emperor. Speak with calm, logic, and resilience." }
];

app.get("/api/profiles", (req, res) => {
	res.json(historicalProfiles);
});

//--------------------------------------------
//	AUTH HELPERS
//--------------------------------------------

function authenticateToken(req, res, next) {
	const authHeader = req.headers["authorization"];
	const token = authHeader?.split(" ")[1];
	if (!token) return res.sendStatus(401);

	jwt.verify(token, SECRET_KEY, (err, user) => {
		if (err) return res.sendStatus(403);
		req.user = user;
		next();
	});
}

//--------------------------------------------
// ACCESS CONTROL HELPERS
//--------------------------------------------

function hasActiveAccess(user) {
	if (user.lifetime) return true;
	if (!user.expires_at) return false;

	return new Date(user.expires_at) > new Date();
}

function canAccessCharacter(user, characterId) {
	if (!hasActiveAccess(user)) return false;

	if (user.lifetime) return true;

	if (user.plan === "all") return true;

	// This gives the Basic plan access to Character #1 (now Einstein)
if (user.plan === "god" && characterId === 1) return true;

	return false;
}

//--------------------------------------------
//	REGISTER
//--------------------------------------------

app.post("/api/register", async (req, res) => {
	let { email, password } = req.body || {};
	if (!email || !password)
		return res.status(400).json({ error: "Email and password required" });

	email = email.trim().toLowerCase();

	try {
		const check = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
		if (check.rows.length > 0)
			return res.status(400).json({ error: "User already exists" });

		const hashed = await bcrypt.hash(password, 10);

		await pool.query(
			`INSERT INTO users (email, password) VALUES ($1, $2)`,
			[email, hashed]
		);

		res.status(201).json({ ok: true, message: "Registered successfully" });
	} catch (err) {
		res.status(500).json({ error: "Server error" });
	}
});

//--------------------------------------------
//	LOGIN
//--------------------------------------------

app.post("/api/login", async (req, res) => {
	const { email, password } = req.body || {};

	try {
		const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
		if (result.rows.length === 0)
			return res.status(400).json({ error: "Invalid credentials" });

		const user = result.rows[0];
		const match = await bcrypt.compare(password, user.password);
		if (!match) return res.status(400).json({ error: "Invalid credentials" });

		const token = jwt.sign(
			{ id: user.id, email: user.email },
			SECRET_KEY,
			{ expiresIn: "7d" }
		);

		res.json({ token });
	} catch (err) {
		res.status(500).json({ error: "Server error" });
	}
});

// 1. Remove 'authenticateToken' from this route to allow guests
app.post("/api/create-payment-intent", authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body;
const email = req.user.email;
const userId = req.user.id;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        const amounts = {
            'god': 2995,
            'all': 3595,
            'lifetime': 4995
        };

        const amount = amounts[plan];

        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: "usd",
            metadata: { 
                plan, 
                email, // Essential for the webhook to find the user
                userId 
            },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
//--------------------------------------------
// STRIPE CHECKOUT (ONE-TIME PAYMENTS)
//--------------------------------------------

app.post("/api/create-checkout", authenticateToken, async (req, res) => {
	try {
		const { plan } = req.body;

		let amount;
		let name;

		if (plan === "god") {
			amount = 2995;
			name = "God Access (30 days)";
		} else if (plan === "all") {
			amount = 3595;
			name = "Full Access (30 days)";
		} else if (plan === "lifetime") {
			amount = 4995;
			name = "Lifetime Access";
		} else {
			return res.status(400).json({ error: "Invalid plan" });
		}

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ["card"],
			mode: "payment",
			customer_email: req.user.email,
			line_items: [
				{
					price_data: {
						currency: "usd",
						product_data: { name },
						unit_amount: amount
					},
					quantity: 1
				}
			],
			metadata: { plan },
			success_url: "https://your-site.com/success",
			cancel_url: "https://your-site.com/cancel"
		});

		res.json({ url: session.url });
	} catch (err) {
		console.error("Checkout error:", err);
		res.status(500).json({ error: "Stripe error" });
	}
});

//--------------------------------------------
//	FILE UPLOADS
//--------------------------------------------

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, uploadsDir),
	filename: (req, file, cb) => {
		const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
		cb(null, unique + path.extname(file.originalname));
	}
});

const upload = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 }
});

app.post("/api/upload", authenticateToken, upload.single("file"), (req, res) => {
	if (!req.file)
		return res.status(400).json({ error: "No file uploaded" });

	res.json({ url: `/uploads/${req.file.filename}` });
});

app.use("/uploads", express.static(uploadsDir));

//--------------------------------------------
//	SERVE STATIC IMAGES
//--------------------------------------------

const imageDir = path.resolve(__dirname, "public/img");
app.use("/img", express.static(imageDir));

//--------------------------------------------
// FRONTEND STATIC FILES
//--------------------------------------------

const frontendPath = path.join(__dirname, "public");

app.use(express.static(frontendPath));

// Inject footer links into every HTML page
app.use((req, res, next) => {
	const oldSend = res.send;

	res.send = function (data) {
		if (typeof data === "string" && data.includes("</body>")) {
			data = data.replace(
				"</body>",
				`
<footer style="
margin-top:40px;
padding:20px;
text-align:center;
font-size:14px;
color:#aaa;
border-top:1px solid rgba(0,0,0,0.1);
">
<a href="/privacy-policy.html">Privacy Policy</a> |
<a href="/terms-and-conditions.html">Terms & Conditions</a>
</footer>
</body>`
			);
		}
		return oldSend.call(this, data);
	};

	next();
});
//--------------------------------------------
//	OPENAI/OPENROUTER CLIENT
//--------------------------------------------

const openai = new OpenAI({	
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: process.env.OPENROUTER_API_KEY,
	defaultHeaders: {
		'HTTP-Referer': 'https://www.speaktoheaven.com',	
		'X-Title': 'Speak to Heaven'	 	 	 	 	
	}
});

//--------------------------------------------
//	CHAT ROUTE (NOW DYNAMICALLY USES CHARACTER PROFILES)
//--------------------------------------------

app.get("/api/chat/history", async (req, res) => {
	try {
		const authHeader = req.headers.authorization;
		const token = authHeader && authHeader.split(" ")[1];
		if (!token) return res.status(401).json({ error: "No token" });
		const decoded = jwt.verify(token, SECRET_KEY);
		const userId = decoded.id;
		const { characterId } = req.query;

		const history = await pool.query(
			"SELECT * FROM messages WHERE user_id = $1 AND character_id = $2 ORDER BY created_at ASC LIMIT 50",
			[userId, characterId]
		);
		res.json(history.rows);
	} catch (err) {
		res.status(500).json({ error: "Failed to load history" });
	}
});

app.post("/api/chat", authenticateToken, async (req, res) => {
	try {
		const { characterId, message } = req.body;

		if (!characterId || !message)
			return res.status(400).json({ error: "Missing character or message" });

		const character = historicalProfiles.find(c => c.id === Number(characterId));
		if (!character)
			return res.status(400).json({ error: "Invalid character" });

		const userId = req.user.id;

		// 🔒 Check user access and free message limit
		const userResult = await pool.query(
			"SELECT plan, lifetime, expires_at, messages_sent FROM users WHERE id = $1",
			[userId]
		);
		const userData = userResult.rows[0];

		const isPaid = userData.lifetime || (userData.expires_at && new Date(userData.expires_at) > new Date());

		// Only block if they are NOT paid AND their specific message counter is 3 or more.
		// When they pay, the Webhook sets messages_sent back to 0, which unlocks this.
		if (!isPaid && parseInt(userData.messages_sent) >= 3) {
			return res.status(403).json({ 
				error: "LIMIT_REACHED", 
				message: "You have used your 3 free hostorical consultations. Please choose an offering to continue." 
			});
		}

		// Save user message
		await pool.query(
			`INSERT INTO messages (user_id, character_id, from_user, text)
			 VALUES ($1, $2, true, $3)`,
			[userId, characterId, message]
		);

		// Load chat history
		const history = await pool.query(
			`SELECT * FROM messages
			 WHERE user_id = $1 AND character_id = $2
			 ORDER BY created_at ASC
			 LIMIT 20`,
			[userId, characterId]
		);

		const chatHistory = history.rows.map(m => ({
			role: m.from_user ? "user" : "assistant",
			content: m.text
		}));

		// 🔑 NEW: Dynamically set the system prompt based on the character's description
		const systemPrompt = `
You are ${character.name}, a prominent historical figure.

${character.description}

RULES:
- Stay fully in character as ${character.name} at all times.
- Speak using the tone, vocabulary, and knowledge appropriate to your era.
- Do NOT say you are an AI.
- If asked about modern things you wouldn't know, respond with curiosity or confusion based on your time period.
- Use your known life experiences and historical context to provide authentic answers.

Remain in character at all times.
`;

		// Send to OpenRouter/OpenAI
		const aiResponse = await openai.chat.completions.create({	
			model: "openai/gpt-3.5-turbo",	
			messages: [
				{ role: "system", content: systemPrompt }, 
				...chatHistory,
				{ role: "user", content: message }
			],
			temperature: 0.7,
			max_tokens: 400
		});

		const reply = aiResponse.choices?.[0]?.message?.content;

		// Save assistant reply
		if (reply) {
			await pool.query(
				`INSERT INTO messages (user_id, character_id, from_user, text)
				 VALUES ($1, $2, false, $3)`,
				[userId, characterId, reply]
			);
		}

// Increment free message counter
				if (!isPaid) {
			await pool.query("UPDATE users SET messages_sent = messages_sent + 1 WHERE id = $1", [userId]);
		}

		res.json({ reply: reply || "(No response)" });

	} catch (err) {
		console.error("DEBUG ERROR:", err);
		res.status(500).json({ error: "Server Error: " + (err.message || "Unknown") });
	}
});

//--------------------------------------------
//	FETCH MESSAGES ROUTE
//--------------------------------------------

app.get("/api/messages/:characterId", authenticateToken, async (req, res) => {
	try {
		const { characterId } = req.params;

		const result = await pool.query(
			`SELECT * FROM messages
			 WHERE user_id = $1 AND character_id = $2
			 ORDER BY created_at ASC`,
			[req.user.id, characterId]
		);

		res.json(result.rows);
	} catch (err) {
		console.error("Fetch messages error:", err);
		res.status(500).json({ error: "Server error" });
	}
});

app.get("/", (req, res) => {
	res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Speak To Heaven</title>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>
body{
font-family: Arial;
background:#0f172a;
color:white;
text-align:center;
padding:60px;
}

footer{
margin-top:60px;
opacity:.7;
font-size:14px;
}

a{
color:#60a5fa;
text-decoration:none;
margin:0 10px;
}
</style>
</head>

<body>

<h1>Speak To Heaven</h1>

<p>Your AI biblical conversation platform.</p>

<footer>
<a href="/privacy-policy.html">Privacy Policy</a> |
<a href="/terms-and-conditions.html">Terms & Conditions</a>
</footer>

</body>
</html>
`);
});

//--------------------------------------------
// LEGAL PAGES
//--------------------------------------------

app.get("/privacy-policy", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "privacy-policy.html"));
});

app.get("/terms", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "terms-and-conditions.html"));
});
//--------------------------------------------
//	404 HANDLER
//--------------------------------------------

app.use((req, res) => {
	res.status(404).json({ error: "Endpoint not found" });
});

//--------------------------------------------
//	SERVER START
//--------------------------------------------

app.listen(PORT, () => {
	console.log("======================================");
	console.log("📖 HOLY CHAT SERVER RUNNING");
	console.log(`🌍 Port: ${PORT}`);
	console.log("======================================");
});