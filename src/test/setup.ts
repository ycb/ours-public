import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// The first render in each file pays for a fresh jsdom and a cold app load. On a busy machine
// running every file in parallel that can pass the 1 s default and fail a correct test.
configure({ asyncUtilTimeout: 5000 });

afterEach(cleanup);
