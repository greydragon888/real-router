import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { h } from "vue";

import { Streamed } from "../../src/components/Streamed";

describe("<Streamed>", () => {
  it("renders default slot when no descendant suspends", () => {
    const wrapper = mount(Streamed, {
      slots: {
        default: () => h("span", { "data-testid": "ready" }, "ready"),
        fallback: () => h("span", { "data-testid": "fallback" }, "loading"),
      },
    });

    expect(wrapper.find('[data-testid="ready"]').exists()).toBe(true);
  });
});
