#!/usr/bin/env python3
"""Desktop GUI for the Insta360 uploader using customtkinter."""

import os
import threading
import tkinter as tk
from tkinter import filedialog

import customtkinter as ctk

from config import load_config, save_config
from core import StitchConfig, run_full_pipeline, CancelledError


class UploaderApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Insta360 Uploader")
        self.geometry("720x680")
        self.minsize(600, 550)

        self.config = load_config()
        self.cancel_event = threading.Event()
        self.worker_thread = None

        self._build_ui()
        self._load_config_to_ui()

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self):
        container = ctk.CTkScrollableFrame(self)
        container.pack(fill="both", expand=True, padx=10, pady=10)

        # --- Connection ---
        conn_frame = ctk.CTkFrame(container)
        conn_frame.pack(fill="x", pady=(0, 8))

        ctk.CTkLabel(conn_frame, text="CONNECTION", font=ctk.CTkFont(weight="bold")).pack(anchor="w", padx=10, pady=(8, 4))

        row = ctk.CTkFrame(conn_frame, fg_color="transparent")
        row.pack(fill="x", padx=10, pady=2)
        ctk.CTkLabel(row, text="API URL:", width=80, anchor="w").pack(side="left")
        self.api_url_entry = ctk.CTkEntry(row, width=400)
        self.api_url_entry.pack(side="left", fill="x", expand=True)

        row = ctk.CTkFrame(conn_frame, fg_color="transparent")
        row.pack(fill="x", padx=10, pady=(2, 8))
        ctk.CTkLabel(row, text="Name:", width=80, anchor="w").pack(side="left")
        self.name_entry = ctk.CTkEntry(row, width=400)
        self.name_entry.pack(side="left", fill="x", expand=True)

        # --- Stitching ---
        stitch_frame = ctk.CTkFrame(container)
        stitch_frame.pack(fill="x", pady=(0, 8))

        ctk.CTkLabel(stitch_frame, text="STITCHING", font=ctk.CTkFont(weight="bold")).pack(anchor="w", padx=10, pady=(8, 4))

        row = ctk.CTkFrame(stitch_frame, fg_color="transparent")
        row.pack(fill="x", padx=10, pady=2)
        ctk.CTkLabel(row, text="Stitcher:", width=80, anchor="w").pack(side="left")
        self.stitcher_entry = ctk.CTkEntry(row, width=340)
        self.stitcher_entry.pack(side="left", fill="x", expand=True)
        ctk.CTkButton(row, text="Browse", width=60, command=self._browse_stitcher).pack(side="left", padx=(4, 0))

        row = ctk.CTkFrame(stitch_frame, fg_color="transparent")
        row.pack(fill="x", padx=10, pady=2)
        ctk.CTkLabel(row, text="Output dir:", width=80, anchor="w").pack(side="left")
        self.output_dir_entry = ctk.CTkEntry(row, width=340)
        self.output_dir_entry.pack(side="left", fill="x", expand=True)
        ctk.CTkButton(row, text="Browse", width=60, command=self._browse_output_dir).pack(side="left", padx=(4, 0))

        row = ctk.CTkFrame(stitch_frame, fg_color="transparent")
        row.pack(fill="x", padx=10, pady=2)
        ctk.CTkLabel(row, text="Stitch type:", width=80, anchor="w").pack(side="left")
        self.stitch_type_var = ctk.StringVar(value="optflow")
        ctk.CTkOptionMenu(row, variable=self.stitch_type_var, values=["optflow", "template", "dynamicstitch"], width=150).pack(side="left")
        ctk.CTkLabel(row, text="  Output size:", anchor="w").pack(side="left", padx=(16, 0))
        self.output_size_var = ctk.StringVar(value="3840x1920")
        ctk.CTkOptionMenu(row, variable=self.output_size_var, values=["3840x1920", "5760x2880", "2880x1440"], width=140).pack(side="left")

        row = ctk.CTkFrame(stitch_frame, fg_color="transparent")
        row.pack(fill="x", padx=10, pady=2)
        self.flowstate_var = ctk.BooleanVar(value=True)
        ctk.CTkCheckBox(row, text="FlowState", variable=self.flowstate_var).pack(side="left")
        self.colorplus_var = ctk.BooleanVar(value=True)
        ctk.CTkCheckBox(row, text="ColorPlus", variable=self.colorplus_var).pack(side="left", padx=(16, 0))
        self.skip_stitch_var = ctk.BooleanVar(value=False)
        ctk.CTkCheckBox(row, text="Skip Stitch", variable=self.skip_stitch_var).pack(side="left", padx=(16, 0))

        row = ctk.CTkFrame(stitch_frame, fg_color="transparent")
        row.pack(fill="x", padx=10, pady=(2, 8))
        ctk.CTkLabel(row, text="Extra opts:", width=80, anchor="w").pack(side="left")
        self.extra_opts_entry = ctk.CTkEntry(row, width=400)
        self.extra_opts_entry.pack(side="left", fill="x", expand=True)

        # --- Upload ---
        upload_frame = ctk.CTkFrame(container)
        upload_frame.pack(fill="x", pady=(0, 8))

        ctk.CTkLabel(upload_frame, text="UPLOAD", font=ctk.CTkFont(weight="bold")).pack(anchor="w", padx=10, pady=(8, 4))

        row = ctk.CTkFrame(upload_frame, fg_color="transparent")
        row.pack(fill="x", padx=10, pady=2)
        ctk.CTkLabel(row, text="Path:", width=80, anchor="w").pack(side="left")
        self.dir_entry = ctk.CTkEntry(row, width=340)
        self.dir_entry.pack(side="left", fill="x", expand=True)
        ctk.CTkButton(row, text="Dir", width=40, command=self._browse_directory).pack(side="left", padx=(4, 0))
        ctk.CTkButton(row, text="File", width=40, command=self._browse_file).pack(side="left", padx=(4, 0))

        row = ctk.CTkFrame(upload_frame, fg_color="transparent")
        row.pack(fill="x", padx=10, pady=8)
        self.start_btn = ctk.CTkButton(row, text="Scan & Upload", command=self._start_upload, width=140)
        self.start_btn.pack(side="left")
        self.cancel_btn = ctk.CTkButton(row, text="Cancel", command=self._cancel_upload, width=100, state="disabled", fg_color="gray")
        self.cancel_btn.pack(side="left", padx=(8, 0))

        self.progress_bar = ctk.CTkProgressBar(upload_frame, width=400)
        self.progress_bar.pack(fill="x", padx=10, pady=(0, 4))
        self.progress_bar.set(0)

        self.status_label = ctk.CTkLabel(upload_frame, text="Ready", anchor="w")
        self.status_label.pack(fill="x", padx=10, pady=(0, 8))

        # --- Log ---
        log_frame = ctk.CTkFrame(container)
        log_frame.pack(fill="both", expand=True, pady=(0, 4))

        ctk.CTkLabel(log_frame, text="Log", font=ctk.CTkFont(weight="bold")).pack(anchor="w", padx=10, pady=(8, 4))

        self.log_text = ctk.CTkTextbox(log_frame, height=160)
        self.log_text.pack(fill="both", expand=True, padx=10, pady=(0, 8))

    def _load_config_to_ui(self):
        c = self.config
        self.api_url_entry.insert(0, c.get("api_url", ""))
        self.name_entry.insert(0, c.get("name", ""))
        self.stitcher_entry.insert(0, c.get("stitcher_path", ""))
        self.output_dir_entry.insert(0, c.get("stitch_output_dir", ""))
        self.stitch_type_var.set(c.get("stitch_type", "optflow"))
        self.output_size_var.set(c.get("output_size", "3840x1920"))
        self.flowstate_var.set(c.get("enable_flowstate", True))
        self.colorplus_var.set(c.get("enable_colorplus", True))
        self.skip_stitch_var.set(c.get("skip_stitch", False))
        self.extra_opts_entry.insert(0, c.get("extra_stitch_options", ""))
        self.dir_entry.insert(0, c.get("last_directory", ""))

    def _save_config_from_ui(self):
        self.config.update({
            "api_url": self.api_url_entry.get().strip(),
            "name": self.name_entry.get().strip(),
            "stitcher_path": self.stitcher_entry.get().strip(),
            "stitch_output_dir": self.output_dir_entry.get().strip(),
            "stitch_type": self.stitch_type_var.get(),
            "output_size": self.output_size_var.get(),
            "enable_flowstate": self.flowstate_var.get(),
            "enable_colorplus": self.colorplus_var.get(),
            "skip_stitch": self.skip_stitch_var.get(),
            "extra_stitch_options": self.extra_opts_entry.get().strip(),
            "last_directory": self.dir_entry.get().strip(),
        })
        save_config(self.config)

    def _browse_stitcher(self):
        path = filedialog.askopenfilename(title="Select stitcher binary")
        if path:
            self.stitcher_entry.delete(0, "end")
            self.stitcher_entry.insert(0, path)

    def _browse_output_dir(self):
        path = filedialog.askdirectory(title="Select stitch output directory")
        if path:
            self.output_dir_entry.delete(0, "end")
            self.output_dir_entry.insert(0, path)

    def _browse_directory(self):
        initial = self.dir_entry.get().strip() or None
        path = filedialog.askdirectory(title="Select Insta360 files directory", initialdir=initial)
        if path:
            self.dir_entry.delete(0, "end")
            self.dir_entry.insert(0, path)

    def _browse_file(self):
        initial = self.dir_entry.get().strip() or None
        initial_dir = os.path.dirname(initial) if initial and os.path.isfile(initial) else initial
        path = filedialog.askopenfilename(
            title="Select Insta360 file",
            initialdir=initial_dir,
            filetypes=[("Insta360 files", "*.insv *.insp *.lrv *.mp4"), ("All files", "*.*")],
        )
        if path:
            self.dir_entry.delete(0, "end")
            self.dir_entry.insert(0, path)

    def _log(self, message: str):
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")

    def _set_status(self, text: str):
        self.status_label.configure(text=text)

    def _set_progress(self, value: float):
        self.progress_bar.set(max(0, min(1, value / 100)))

    def _start_upload(self):
        api_url = self.api_url_entry.get().strip()
        name = self.name_entry.get().strip()
        directory = self.dir_entry.get().strip()

        if not api_url:
            self._log("ERROR: API URL is required")
            return
        if not name:
            self._log("ERROR: Name is required")
            return
        if not directory or not os.path.exists(directory):
            self._log("ERROR: Valid file or directory path is required")
            return

        self._save_config_from_ui()

        self.cancel_event.clear()
        self.start_btn.configure(state="disabled")
        self.cancel_btn.configure(state="normal", fg_color=["#c42b1c", "#c42b1c"])
        self.log_text.delete("1.0", "end")
        self._set_progress(0)

        stitch_config = StitchConfig(
            stitch_type=self.stitch_type_var.get(),
            output_size=self.output_size_var.get(),
            enable_flowstate=self.flowstate_var.get(),
            enable_colorplus=self.colorplus_var.get(),
            stitcher_path=self.stitcher_entry.get().strip(),
            output_dir=self.output_dir_entry.get().strip(),
            extra_options=self.extra_opts_entry.get().strip(),
        )

        def on_progress(stage: str, message: str, percent: float):
            self.after(0, lambda: self._log(f"[{stage}] {message}"))
            self.after(0, lambda: self._set_status(message))
            self.after(0, lambda: self._set_progress(percent))

        def worker():
            try:
                summary = run_full_pipeline(
                    directory=directory,
                    api_url=api_url,
                    name=name,
                    stitch_config=stitch_config,
                    skip_stitch=self.skip_stitch_var.get(),
                    on_progress=on_progress,
                    cancel_event=self.cancel_event,
                )
                self.after(0, lambda: self._log(f"\n{summary}"))
                self.after(0, lambda: self._set_status(summary))
                self.after(0, lambda: self._set_progress(100))
            except CancelledError:
                self.after(0, lambda: self._log("\nCancelled."))
                self.after(0, lambda: self._set_status("Cancelled"))
            except Exception as e:
                self.after(0, lambda: self._log(f"\nERROR: {e}"))
                self.after(0, lambda: self._set_status(f"Error: {e}"))
            finally:
                self.after(0, self._upload_finished)

        self.worker_thread = threading.Thread(target=worker, daemon=True)
        self.worker_thread.start()

    def _cancel_upload(self):
        self.cancel_event.set()
        self.cancel_btn.configure(state="disabled")
        self._set_status("Cancelling...")

    def _upload_finished(self):
        self.start_btn.configure(state="normal")
        self.cancel_btn.configure(state="disabled", fg_color="gray")

    def _on_close(self):
        self._save_config_from_ui()
        if self.worker_thread and self.worker_thread.is_alive():
            self.cancel_event.set()
        self.destroy()


if __name__ == "__main__":
    ctk.set_appearance_mode("system")
    ctk.set_default_color_theme("blue")
    app = UploaderApp()
    app.mainloop()
