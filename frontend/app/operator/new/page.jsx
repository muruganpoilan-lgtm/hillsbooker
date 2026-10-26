"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import OperatorGuard from "../../../components/dashboard/OperatorGuard";
import VehicleForm from "../../../components/dashboard/VehicleForm";
import { api } from "../../../lib/api";

function New() {
  const { token, logout } = useAuth();
  const router = useRouter();

  async function create(body) {
    const res = await api("/operator/vehicles", { method: "POST", token, body });
    if (res.status === 401) {
      logout();
      return "Your session ended. Log in again.";
    }
    if (!res.ok) return res.error;
    router.push(`/operator/vehicles/${res.data.id}`);
    return null;
  }

  return (
    <>
      <p className="meta">
        <Link href="/operator">← Your vehicles</Link>
      </p>
      <h1 className="section-title">Add a vehicle</h1>
      <p className="meta">Next you can add photos and fixed-price trips.</p>
      <div className="narrow">
        <VehicleForm submitLabel="Save and continue" onSubmit={create} />
      </div>
    </>
  );
}

export default function NewVehiclePage() {
  return (
    <OperatorGuard>
      <New />
    </OperatorGuard>
  );
}
