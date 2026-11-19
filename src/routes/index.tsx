import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/vastu/studio";

export const Route = createFileRoute("/")({ component: Studio });
