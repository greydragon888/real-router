import type { JSX } from "solid-js";

export function UserSettings(): JSX.Element {
  return (
    <div>
      <h1>User Settings</h1>
      <div class="card">
        <div class="form-group">
          <label>Notification Preferences</label>
          <select>
            <option value="all" selected>
              All notifications
            </option>
            <option value="mentions">Mentions only</option>
            <option value="none">None</option>
          </select>
        </div>
        <div class="form-group">
          <label>Theme</label>
          <select>
            <option value="light" selected>
              Light
            </option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <button class="primary" style={{ "margin-top": "8px" }}>
          Save Settings
        </button>
      </div>
    </div>
  );
}
