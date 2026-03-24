import type { JSX } from "preact";

export default function Settings(): JSX.Element {
  return (
    <div>
      <h1>Settings</h1>
      <p>This component was lazy-loaded in a separate chunk.</p>
      <div className="card">
        <div className="form-group">
          <label>Language</label>
          <select defaultValue="en">
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="de">German</option>
          </select>
        </div>
        <div className="form-group">
          <label>Timezone</label>
          <select defaultValue="utc">
            <option value="utc">UTC</option>
            <option value="est">EST</option>
            <option value="pst">PST</option>
          </select>
        </div>
      </div>
    </div>
  );
}
