"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export default function Modal({ 
  children, 
  title, 
  onCloseRoute 
}: { 
  children: React.ReactNode; 
  title: string; 
  onCloseRoute: string; 
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!dialogRef.current?.open) {
      dialogRef.current?.showModal();
      document.body.style.overflow = "hidden";
    }
    
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const closeModal = () => {
    document.body.style.overflow = "";
    dialogRef.current?.close();
    router.push(onCloseRoute, { scroll: false });
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      onClose={closeModal}
      onClick={(e) => {
        if (e.target === dialogRef.current) closeModal();
      }}
    >
      <div className="modal-content animate-fade-in" style={{ animationDuration: '0.2s' }}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button onClick={closeModal} className="modal-close-btn"><X size={20} /></button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </dialog>
  );
}
