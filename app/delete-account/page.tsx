import { DeleteAccountStatusContent } from "@/components/delete-account-status-content"

export default async function DeleteAccountStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const success = status === "success"

  return <DeleteAccountStatusContent success={success} />
}
