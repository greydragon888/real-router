import { Component } from "@angular/core";
import { RealLink } from "@real-router/angular";

const USERS = [
  { id: "1", name: "Alice", role: "Admin" },
  { id: "2", name: "Bob", role: "Editor" },
  { id: "3", name: "Carol", role: "Viewer" },
];

@Component({
  selector: "users-list",
  imports: [RealLink],
  template: `
    <div>
      <h1>Users</h1>
      <p>Click a user to view their profile. Notice how breadcrumbs update.</p>
      @for (user of users; track user.id) {
        <div class="card">
          <strong>{{ user.name }}</strong>
          <span style="margin-left: 8px; color: #888;">{{ user.role }}</span>
          <div style="margin-top: 8px;">
            <a
              realLink
              routeName="users.profile"
              [routeParams]="{ id: user.id }"
            >
              View Profile →
            </a>
          </div>
        </div>
      }
    </div>
  `,
})
export class UsersListComponent {
  readonly users = USERS;
}
