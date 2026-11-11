# AsanaFlow — Personal Work, Deadlines & Google Calendar Hub

An Asana-inspired personal task manager, Kanban board, and deadline calendar designed to run 100% client-side on **GitHub Pages**.

## ✨ Features

1. **4 Asana Workspace Views**
   - **Home & Overview Dashboard**: Live KPI cards (Overdue, Due Today, Next 7 Days, Completed), urgent priority list, merged Google Calendar + Task Deadlines feed, and Project progress bars.
   - **My Tasks (List View)**: Collapsible Asana sections grouped by **Section** (`Today`, `Upcoming`, `Later`, `Completed`), **Status**, or **Project**.
   - **Kanban Board View**: Drag-and-drop cards across `To Do`, `In Progress`, `In Review`, and `Done` columns.
   - **Calendar & Deadlines View**: Monthly interactive calendar grid + chronological upcoming deadlines sidebar showing both Asana tasks and Google Calendar events side by side.
2. **Slide-Over Task Detail Drawer**
   - Manage subtasks with a live progress bar, recurring deadlines (`Daily`, `Weekly`, `Biweekly`, `Monthly`), priority levels, tags, notes, and calendar sync actions.
3. **Google Calendar Integration (Zero-Setup + Full 2-Way OAuth API)**
   - **Zero-Setup**: 1-click **+GCal** button on every task (opens Google Calendar pre-filled with title, deadline, duration, project, and subtasks), plus full `.ics` export and `.ics` import.
   - **Live 2-Way OAuth 2.0 Sync**: Add your Google Cloud Web OAuth Client ID in **⚙️ Calendar Sync** to fetch upcoming Google Calendar events directly into AsanaFlow and push task deadlines to your primary Google Calendar with 1 click.
4. **GitHub Pages Storage & Optional Cloud Sync**
   - Automatic `localStorage` persistence + 1-click `.json` backup download/restore.
   - Optional **GitHub Gist Cloud Sync** so your tasks stay synced across your laptop and phone for free.

---

## 🚀 Deploying to Your GitHub Pages (`GuillermoHern023`)

1. Create a new repository on GitHub (e.g., `https://github.com/GuillermoHern023/asanaflow`).
2. Push this folder to GitHub:
   ```powershell
   cd c:\Users\guill\Desktop\randomantigravity\asana-hub
   git remote add origin https://github.com/GuillermoHern023/asanaflow.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**, under **Build and deployment** select **Deploy from a branch** → `main` / `/ (root)` → **Save**.
4. Your app will be live at `https://guillermohern023.github.io/asanaflow/`!
