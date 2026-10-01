import * as DialogPrimitive from '@radix-ui/react-dialog'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onOpenChange,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[min(400px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border border-line bg-panel p-4">
          <DialogPrimitive.Title className="text-[13px] font-medium">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-[12px] leading-5 text-muted">
            {description}
          </DialogPrimitive.Description>
          <div className="mt-4 flex justify-end gap-2">
            <DialogPrimitive.Close className="h-7 border border-line px-2.5 text-[12px] hover:bg-white/5">
              Cancel
            </DialogPrimitive.Close>
            <button
              type="button"
              className="h-7 bg-accent px-2.5 text-[12px] font-medium text-[#101216]"
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
