import { Component, computed } from "@angular/core";
import { RealLink, injectRoute } from "@real-router/angular";

import type { UsersListData } from "../router/loaders";

@Component({
  selector: "users-list-page",
  imports: [RealLink],
  template: `
    <div data-testid="users-list">
      <h2>All Users</h2>
      <ul>
        @for (user of data().users; track user.id) {
          <li [attr.data-user-id]="user.id">
            <a
              realLink
              routeName="users.profile"
              [routeParams]="{ id: user.id }"
            >
              {{ user.name }}
            </a>
          </li>
        }
      </ul>
    </div>
  `,
})
export class UsersListComponent {
  private readonly route = injectRoute();

  readonly data = computed<UsersListData>(() => {
    const data = this.route.routeState().route.context.data as
      | UsersListData
      | undefined;

    return data ?? { users: [] };
  });
}
