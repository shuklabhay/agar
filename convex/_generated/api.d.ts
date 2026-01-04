/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as answerGeneration from "../answerGeneration.js";
import type * as assignments from "../assignments.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as classes from "../classes.js";
import type * as http from "../http.js";
import type * as llm from "../llm.js";
import type * as myFunctions from "../myFunctions.js";
import type * as processAssignment from "../processAssignment.js";
import type * as questionExtraction from "../questionExtraction.js";
import type * as questions from "../questions.js";
import type * as studentProgress from "../studentProgress.js";
import type * as studentSessions from "../studentSessions.js";
import type * as tutorLLM from "../tutorLLM.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  answerGeneration: typeof answerGeneration;
  assignments: typeof assignments;
  auth: typeof auth;
  chat: typeof chat;
  classes: typeof classes;
  http: typeof http;
  llm: typeof llm;
  myFunctions: typeof myFunctions;
  processAssignment: typeof processAssignment;
  questionExtraction: typeof questionExtraction;
  questions: typeof questions;
  studentProgress: typeof studentProgress;
  studentSessions: typeof studentSessions;
  tutorLLM: typeof tutorLLM;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
