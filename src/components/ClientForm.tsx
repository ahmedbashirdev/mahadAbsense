"use client";

import { useRef } from "react";
import { toast } from "sonner";

export default function ClientForm({ 
  action, 
  children, 
  successMessage,
  className,
  style 
}: { 
  action: (formData: FormData) => Promise<any>; 
  children: React.ReactNode;
  successMessage?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (formData: FormData) => {
    try {
      const result = await action(formData);
      if (result && typeof result === "object" && result.error) {
        toast.error(result.error);
      } else {
        if (successMessage) toast.success(successMessage);
      }
    } catch (e) {
      toast.error("حدث خطأ أثناء حفظ البيانات");
    }
  };

  return (
    <form ref={formRef} action={handleSubmit} className={className} style={style}>
      {children}
    </form>
  );
}
