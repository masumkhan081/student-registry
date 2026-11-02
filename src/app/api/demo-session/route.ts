import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  DEMO_COOKIE_NAME,
  DEMO_COOKIE_OPTIONS,
  getDemoIdentity,
  resolveDemoIdentity,
} from "@/lib/demo-session";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  }

  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  try {
    const identity = await resolveDemoIdentity(input);

    if (!identity) {
      return NextResponse.json(
        { error: "Choose a valid demo role and student." },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();

    cookieStore.set(
      DEMO_COOKIE_NAME,
      JSON.stringify(identity),
      DEMO_COOKIE_OPTIONS,
    );

    return NextResponse.json(
      { identity },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("Failed to set demo identity:", error);

    return NextResponse.json(
      { error: "Unable to start the demo session. Please try again." },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const identity = await getDemoIdentity();

    return NextResponse.json(
      { identity },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("Failed to read demo identity:", error);

    return NextResponse.json(
      { error: "Unable to read the demo session. Please try again." },
      { status: 500 },
    );
  }
}