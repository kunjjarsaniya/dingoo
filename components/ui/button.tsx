import * as React from 'react'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'btn-hallmark select-none outline-none font-semibold transition-all cursor-pointer disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4.5',
  {
    variants: {
      variant: {
        default: 'btn-hallmark-coral',
        pear: 'btn-hallmark-pear',
        coral: 'btn-hallmark-coral',
        mint: 'btn-hallmark-mint',
        blue: 'btn-hallmark-blue',
        secondary: 'btn-hallmark-secondary',
        ink: 'btn-hallmark-ink',
        outline: 'border border-[oklch(20%_0.014_255/12%)] bg-white text-[oklch(20%_0.014_255)] hover:bg-[oklch(97%_0.012_95)]',
        ghost: 'bg-transparent text-[oklch(20%_0.014_255)] hover:bg-[oklch(20%_0.014_255/6%)]',
      },
      size: {
        default: 'btn-hallmark-md px-5 text-sm',
        sm: 'btn-hallmark-sm px-3.5 text-xs',
        lg: 'btn-hallmark-lg px-7 text-base',
        pill: 'btn-hallmark-md btn-hallmark-pill px-6 text-sm',
        icon: 'size-10 p-0 rounded-2xl flex items-center justify-center',
        'icon-sm': 'size-8.5 p-0 rounded-xl flex items-center justify-center',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
