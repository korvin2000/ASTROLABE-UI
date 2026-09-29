import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

/**
 * Model text and repository content are untrusted (§30.2): Markdown is rendered with `marked` and sanitized with
 * DOMPurify (no raw HTML survives), then handed to Angular as already-sanitized HTML.
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(text: string | null | undefined): SafeHtml {
    if (!text) return '';
    const html = marked.parse(text, { async: false }) as string;
    const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'img', 'iframe', 'form', 'input'], FORBID_ATTR: ['style'] });
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}
