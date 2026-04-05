import SignupForm from '@/components/SignupForm'

interface Props {
  searchParams?: { code?: string }
}

export default function SignupPage({ searchParams }: Props) {
  return <SignupForm initialCode={searchParams?.code ?? ''} />
}
