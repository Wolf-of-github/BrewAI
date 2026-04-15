import { useState } from 'react'
import {
  X,
  CreditCard,
  Lock,
  Loader2,
  CheckCircle,
  ShieldCheck,
  Zap,
  Crown,
  FileText,
} from 'lucide-react'
import { createCheckoutSession, type PlanId } from '../lib/stripe'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  plan: { id: PlanId; name: string; price: string }
  userEmail: string
  onClose: () => void
  onSuccess: (planId: PlanId) => void
}

type Step = 'review' | 'loading' | 'success'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_ICONS: Record<PlanId, React.ReactNode> = {
  free: <FileText className="w-5 h-5" />,
  pro: <Zap className="w-5 h-5" />,
  ultra: <Crown className="w-5 h-5" />,
}

function formatCardNumber(value: string) {
  return value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2)
  return digits
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StripeCheckout({ plan, userEmail, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('review')

  // Card fields
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate() {
    const e: Record<string, string> = {}
    if (cardNumber.replace(/\s/g, '').length < 16) e.cardNumber = 'Enter a valid 16-digit card number'
    if (expiry.length < 5) e.expiry = 'Enter a valid expiry (MM/YY)'
    if (cvc.length < 3) e.cvc = 'Enter your 3-digit CVC'
    if (!name.trim()) e.name = 'Enter the name on your card'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setStep('loading')
    const result = await createCheckoutSession(plan.id, userEmail)
    if (result.success) {
      setStep('success')
    } else {
      setStep('review')
      setErrors({ submit: result.error ?? 'Something went wrong. Please try again.' })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#4A6FA5]/30 bg-[#1F2A44] shadow-2xl overflow-hidden">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#4A6FA5]/20">
          <div className="flex items-center gap-2.5">
            <img src="/brew.png" alt="Brew AI" className="w-5 h-5 object-contain" />
            <span className="text-sm font-semibold text-[#E5E7EB]">Brew AI</span>
            <span className="text-[#E5E7EB]/20">·</span>
            <span className="text-xs text-[#E5E7EB]/40">Secure checkout</span>
          </div>
          {step !== 'loading' && (
            <button
              onClick={onClose}
              className="text-[#E5E7EB]/30 hover:text-[#E5E7EB] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Success state ────────────────────────────────────── */}
        {step === 'success' && (
          <div className="flex flex-col items-center text-center px-8 py-12 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <p className="text-base font-bold text-[#E5E7EB] mb-1">You're on {plan.name}!</p>
              <p className="text-sm text-[#E5E7EB]/50">
                A confirmation has been sent to <span className="text-[#E5E7EB]/80">{userEmail}</span>.
              </p>
            </div>
            <button
              onClick={() => onSuccess(plan.id)}
              className="mt-2 px-6 py-2.5 rounded-xl bg-[#F59E0B] text-[#1F2A44] text-sm font-semibold hover:bg-[#F59E0B]/80 transition-colors"
            >
              Back to dashboard
            </button>
          </div>
        )}

        {/* ── Review / form state ──────────────────────────────── */}
        {(step === 'review' || step === 'loading') && (
          <div className="p-6 flex flex-col gap-5">

            {/* Plan summary */}
            <div className="flex items-center gap-3 p-4 rounded-xl border border-[#4A6FA5]/20 bg-[#14213D]">
              <div className="w-9 h-9 rounded-lg bg-[#F59E0B]/10 text-[#F59E0B] flex items-center justify-center shrink-0">
                {PLAN_ICONS[plan.id]}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#E5E7EB]">{plan.name} plan</p>
                <p className="text-xs text-[#E5E7EB]/40">Billed monthly · cancel anytime</p>
              </div>
              <p className="text-base font-bold text-[#F59E0B]">{plan.price}<span className="text-xs text-[#E5E7EB]/30 font-normal">/mo</span></p>
            </div>

            {/* Card fields */}
            <div className="flex flex-col gap-3">
              {/* Name on card */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#E5E7EB]/30 mb-1.5 block">
                  Name on card
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  disabled={step === 'loading'}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#14213D] border border-[#4A6FA5]/30 text-sm text-[#E5E7EB] placeholder:text-[#E5E7EB]/20 focus:outline-none focus:border-[#4A6FA5]/60 disabled:opacity-50 transition-colors"
                />
                {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
              </div>

              {/* Card number */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#E5E7EB]/30 mb-1.5 block">
                  Card number
                </label>
                <div className="relative">
                  <input
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="4242 4242 4242 4242"
                    inputMode="numeric"
                    disabled={step === 'loading'}
                    className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-[#14213D] border border-[#4A6FA5]/30 text-sm text-[#E5E7EB] placeholder:text-[#E5E7EB]/20 focus:outline-none focus:border-[#4A6FA5]/60 disabled:opacity-50 transition-colors tracking-widest"
                  />
                  <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E5E7EB]/20" />
                </div>
                {errors.cardNumber && <p className="text-xs text-red-400 mt-1">{errors.cardNumber}</p>}
              </div>

              {/* Expiry + CVC */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#E5E7EB]/30 mb-1.5 block">
                    Expiry
                  </label>
                  <input
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/YY"
                    inputMode="numeric"
                    disabled={step === 'loading'}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#14213D] border border-[#4A6FA5]/30 text-sm text-[#E5E7EB] placeholder:text-[#E5E7EB]/20 focus:outline-none focus:border-[#4A6FA5]/60 disabled:opacity-50 transition-colors"
                  />
                  {errors.expiry && <p className="text-xs text-red-400 mt-1">{errors.expiry}</p>}
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#E5E7EB]/30 mb-1.5 block">
                    CVC
                  </label>
                  <div className="relative">
                    <input
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="•••"
                      inputMode="numeric"
                      type="password"
                      disabled={step === 'loading'}
                      className="w-full pl-3 pr-9 py-2.5 rounded-xl bg-[#14213D] border border-[#4A6FA5]/30 text-sm text-[#E5E7EB] placeholder:text-[#E5E7EB]/20 focus:outline-none focus:border-[#4A6FA5]/60 disabled:opacity-50 transition-colors"
                    />
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#E5E7EB]/20" />
                  </div>
                  {errors.cvc && <p className="text-xs text-red-400 mt-1">{errors.cvc}</p>}
                </div>
              </div>
            </div>

            {errors.submit && (
              <p className="text-xs text-red-400 text-center">{errors.submit}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={step === 'loading'}
              className="w-full py-3 rounded-xl bg-[#F59E0B] text-[#1F2A44] text-sm font-bold hover:bg-[#F59E0B]/80 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {step === 'loading' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Pay {plan.price} / month
                </>
              )}
            </button>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-4 text-[10px] text-[#E5E7EB]/25">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> 256-bit SSL
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3" /> Powered by Stripe
              </span>
              <span>·</span>
              <span>Cancel anytime</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
