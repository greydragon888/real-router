import type { JSX } from "preact";

export function UserSettings(): JSX.Element {
  return (
    <div>
      <h1>User Settings</h1>
      <div className="card">
        <div className="form-group">
          <label>Notification Preferences</label>
          <select defaultValue="all">
            <option value="all">All notifications</option>
            <option value="mentions">Mentions only</option>
            <option value="none">None</option>
          </select>
        </div>
        <div className="form-group">
          <label>Theme</label>
          <select defaultValue="light">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <button className="primary" style={{ marginTop: "8px" }}>
          Save Settings
        </button>
      </div>
    </div>
  );
}
