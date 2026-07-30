import { Component, computed } from "@angular/core";
import { RealLink, injectRoute } from "@real-router/angular";

import type { UsersListData } from "../router/loaders";

@Component({
  selector: "users-list-page",
  imports: [RealLink],
  template: `
    <div>
      <h2>All Users</h2>
      <p data-testid="current-sort">Sorted: {{ data().sort }}</p>
      <a
        realLink
        routeName="users"
        [routeSearch]="{ sort: otherSort() }"
        data-testid="toggle-sort"
      >
        Toggle to {{ otherSort() }}
      </a>
      <ul data-testid="users-list">
        @for (user of data().users; track user.id) {
          <li [attr.data-user-id]="user.id">
            <a
              realLink
              routeName="users.profile"
              [routeParams]="{ id: user.id }"
            >
              {{ user.name }}
            </a>
            {{ " — " }}
            <span [attr.data-testid]="'role-' + user.id">{{ user.role }}</span>
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

    return data ?? { users: [], sort: "asc" };
  });

  readonly otherSort = computed<"asc" | "desc">(() =>
    this.data().sort === "asc" ? "desc" : "asc",
  );
}
