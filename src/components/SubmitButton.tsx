"use client";

import { useFormStatus } from "react-dom";
import React from "react";
import { Loader2 } from "lucide-react";

interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pendingText?: string;
  defaultText: string;
  variant?: "primary" | "danger" | "secondary";
}

export default function SubmitButton({ 
  pendingText = "جاري الحفظ...", 
  defaultText, 
  variant = "primary", 
  className = "", 
  ...props 
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button 
      type="submit" 
      disabled={pending || props.disabled}
      className={`btn btn-${variant} ${className}`}
      {...props}
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" size={18} />
          {pendingText}
        </>
      ) : (
        defaultText
      )}
    </button>
  );
}
