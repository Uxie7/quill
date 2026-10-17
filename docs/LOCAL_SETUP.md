# Local Setup & Running Guide

This guide provides step-by-step instructions to run **Quill** on your machine, covering both **Replay Mode** (zero external dependencies) and **Live Mode** (MongoDB + Ollama).

---

## 1. Quickest Start: Replay Mode (Zero Dependencies)

If you just want to see the UI, try the onboarding, stream live steps, test the egress ledger, and view the dashboard without installing any database or AI models:

```bash
# 1. Install dependencies
npm install

# 2. Start in replay mode
MODE=replay npm run start
```
Open **`http://localhost:3000`** in your browser.
*(On Windows PowerShell: `$env:MODE='replay'; npm run start`)*

---

## 2. Live Mode Prerequisites

To run live transcription, promise extraction, dropout-risk calculation, and drafting, you need:

1. **Node.js**: v20 or v22 (`node -v`)
2. **MongoDB**: Either a free cloud Atlas database or a local MongoDB instance.
3. **Ollama**: To run open-weight models locally (`qwen3:8b` and `nomic-embed-text`).

---

## 3. MongoDB Setup (Choose Option A or Option B)

### Option A: MongoDB Atlas (Cloud Free Tier: Recommended, No Installation Required)

1. Go to [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) and create a free account.
2. Create a free **M0 cluster** (select your nearest region).
3. Under **Security > Database Access**, add a database user (e.g. `quill_user` with password `quill_pass`).
4. Under **Security > Network Access**, click **Add IP Address** > select **Allow Access from Anywhere** (`0.0.0.0/0`) for dev convenience.
5. Under **Database > Clusters**, click **Connect** > **Drivers** (Node.js) and copy your connection string:
   ```
   mongodb+srv://quill_user:<password>@cluster0.abcde.mongodb.net/quill?retryWrites=true&w=majority
   ```
6. Paste it into your `.env` file:
   ```bash
   MONGODB_URI="mongodb+srv://quill_user:quill_pass@cluster0.abcde.mongodb.net/quill?retryWrites=true&w=majority"
   ```

### Option B: Local MongoDB Server

If you prefer running MongoDB locally on your machine:

- **Using Docker**:
  ```bash
  docker run -d --name quill-mongo -p 27017:27017 mongo:latest
  ```
- **Using Native Windows Installer**:
  1. Download MongoDB Community Server from [mongodb.com/try/download/community](https://www.mongodb.com/try/download/community).
  2. Run the MSI installer and check "Install MongoDB as a Service" (default port `27017`).
  3. Set in `.env`:
     ```bash
     MONGODB_URI="mongodb://localhost:27017/quill"
     ```

---

## 4. Ollama Setup (Local Open-Weight LLM)

Quill uses Ollama to run open-weight models locally on your laptop so client data never leaves your machine.

### Step 1: Install Ollama
- **Windows**: Download and run the installer from [ollama.com/download/windows](https://ollama.com/download/windows).
- **Mac / Linux**: Run `curl -fsSL https://ollama.com/install.sh | sh`.

### Step 2: Pull Required Models
Open your terminal and run:

```bash
# 1. Main reasoning & extraction model
ollama pull qwen3:8b

# Note: If your machine has less than 8GB RAM, you can use a lighter model:
# ollama pull qwen2.5:7b   or   ollama pull llama3.2:3b
# (If using another model, update LLM_MODEL in .env accordingly)

# 2. Embedding model for semantic search of past call notes
ollama pull nomic-embed-text
```

### Step 3: Verify Ollama is Running
Visit `http://localhost:11434` or run:
```bash
ollama list
```
You should see `qwen3:8b` (or your chosen model) and `nomic-embed-text`.

---

## 5. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Ensure your `.env` contains:
```env
MODE=live
PORT=3000
MONGODB_URI=mongodb://localhost:27017/quill  # Or your Atlas connection string
LLM_BASE_URL=http://localhost:11434
LLM_MODEL=qwen3:8b
EMBED_MODEL=nomic-embed-text
PRACTITIONER_NAME=Alex
TABPFN_MODE=heuristic
```

---

## 6. Seed the Database

Once MongoDB is running, populate the synthetic clients (Dana, Marcus, Ines), earlier calls, and historical attendance data:

```bash
npm run seed
```

You should see output similar to:
```
dana: starting risk 0.68
marcus: starting risk 0.12
ines: starting risk 0.41
Seeded: { clients: 3, calls: 9, chunks: 27, commitments: 18, attendance: 24, reminders: 2 }
```

---

## 7. Start the Application

Start the local development server:

```bash
npm run dev
```

Open **`http://localhost:3000`** in your browser.

---

## 8. Verifying the End-to-End Workflow

1. **Select a Client**: In the left sidebar of the Workspace, select **Dana** (Freelancer), **Marcus** (Consultant), or **Ines** (Coach).
2. **Process a Call**:
   - Click **"Use the sample call"** (works without microphone or Whisper audio files by feeding the synthetic transcript).
   - Click **"Process this call"**.
3. **Inspect the Live Pipeline**:
   - Watch the step-by-step progress stream in real time.
   - Check the **Egress Ledger** on the right to see exactly what left your machine (e.g., search queries or TabPFN features) and what remained local.
4. **Approve Actions**:
   - In the **Promises** table, click `"wrong person?"` if attribution needs switching.
   - Review the drafted **Follow-up Email** and click **Approve** (options to copy or open in mail app).
   - Review the **Scheduled Reminder** and click **Schedule it**.
5. **Check the Dashboard**:
   - Navigate to the **Dashboard** in the top navigation to see all open promises, overdue items, and scheduled reminders aggregated across all clients.
