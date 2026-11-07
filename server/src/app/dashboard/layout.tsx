import { DashNav } from "@/components/dash-nav"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashNav />
      {children}
    </>
  )
}
