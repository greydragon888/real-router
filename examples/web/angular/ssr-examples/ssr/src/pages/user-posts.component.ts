import { Component, computed } from "@angular/core";
import { injectRoute } from "@real-router/angular";

import type { UserPostsData } from "../router/loaders";

@Component({
  selector: "user-posts",
  template: `
    @if (!data()) {
      <p>Loading…</p>
    } @else if (data()!.posts.length === 0) {
      <div data-testid="user-posts-empty">
        <h3>Posts</h3>
        <p>No posts yet.</p>
      </div>
    } @else {
      <div data-testid="user-posts">
        <h3>Posts</h3>
        <ul>
          @for (post of data()!.posts; track post.id) {
            <li [attr.data-post-id]="post.id">{{ post.title }}</li>
          }
        </ul>
      </div>
    }
  `,
})
export class UserPostsComponent {
  private readonly route = injectRoute();

  readonly data = computed<UserPostsData | undefined>(
    () =>
      this.route.routeState().route.context.data as UserPostsData | undefined,
  );
}
