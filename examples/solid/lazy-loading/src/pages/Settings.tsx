import type { JSX } from "solid-js";

export default function Settings(): JSX.Element {
  return (
    <div>
      <h1>Settings</h1>
      <p>This component was lazy-loaded in a separate chunk.</p>
      <div class="card">
        <div class="form-group">
          <label>Language</label>
          <select>
            <option value="en" selected>English</option>
            <option value="fr">French</option>
            <option value="de">German</option>
          </select>
        </div>
        <div class="form-group">
          <label>Timezone</label>
          <select>
            <option value="utc" selected>UTC</option>
            <option value="est">EST</option>
            <option value="pst">PST</option>
          </select>
        </div>
      </div>
    </div>
  );
}
