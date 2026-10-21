import { createFileRoute } from "@tanstack/react-router";
import { NeonLane } from "@/game/session";

export const Route = createFileRoute("/")({ component: NeonLane });
