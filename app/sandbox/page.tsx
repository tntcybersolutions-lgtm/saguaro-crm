import { redirect } from 'next/navigation';

/**
 * /sandbox used to run its own signup (POST /api/sandbox/signup) into a
 * `sandbox_tenants` table whose columns were never created: every attempt
 * made an auth user, then failed, and the visitor saw "Signup failed".
 * The free trial is the regular signup, so old links land there.
 */
export default function SandboxPage() {
  redirect('/signup');
}
