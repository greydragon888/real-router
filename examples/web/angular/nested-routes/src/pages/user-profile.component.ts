import { Component, computed } from "@angular/core";
import { injectRouteNode } from "@real-router/angular";

const USER_DATA: Record<string, { name: string; role: string; email: string }> =
  {
    "1": { name: "Alice", role: "Admin", email: "alice@example.com" },
    "2": { name: "Bob", role: "Editor", email: "bob@example.com" },
    "3": { name: "Carol", role: "Viewer", email: "carol@example.com" },
  };

@Component({
  selector: "user-profile",
  template: `
    @if (user(); as u) {
      <div>
        <h1>{{ u.name }}</h1>
        <div class="card">
          <p><strong>Role:</strong> {{ u.role }}</p>
          <p><strong>Email:</strong> {{ u.email }}</p>
          <p><strong>ID:</strong> {{ id() }}</p>
        </div>
        <p>
          Notice that <strong>Users</strong> in the outer sidebar remains active
          (ancestor matching) while you browse profiles.
        </p>
      </div>
    } @else {
      <div>
        <h1>User Not Found</h1>
        <p>No user with ID {{ id() }}.</p>
      </div>
    }
  `,
})
export class UserProfileComponent {
  private readonly node = injectRouteNode("users.profile");

  readonly id = computed(() => {
    const params = this.node.routeState().route?.params;
    const raw = params?.["id"];
    return typeof raw === "string" ? raw : "";
  });

  readonly user = computed(() => {
    const id = this.id();
    return id ? USER_DATA[id] : undefined;
  });
}
