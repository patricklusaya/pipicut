import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from '@radix-ui/react-slot'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn.ts'

const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border border-transparent text-[12px] font-medium tracking-tight transition-colors disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-[#101216] hover:bg-[#8ebbff]',
        ghost: 'text-text hover:bg-white/5',
        outline: 'border-line bg-transparent text-text hover:bg-white/5',
      },
      size: {
        sm: 'h-7 px-2.5',
        icon: 'size-7',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'sm',
    },
  },
)

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    />
  )
}
