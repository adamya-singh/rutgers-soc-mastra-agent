'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStyling } from 'cedar-os';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
	content: string;
	processPrefix?: boolean;
	className?: string;
	inline?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
	content,
	processPrefix = false,
	className = '',
	inline = false,
}) => {
	const { styling } = useStyling();
	const [copiedCode, setCopiedCode] = useState<string | null>(null);

	const handleCopyCode = (code: string) => {
		navigator.clipboard.writeText(code);
		setCopiedCode(code);
		setTimeout(() => setCopiedCode(null), 2000);
	};

	// Helper function to process prefix markers in text if needed
	const processChildren = (children: React.ReactNode): React.ReactNode => {
		if (!processPrefix) return children;

		if (typeof children === 'string') {
			const parts = children.split(/(@@PREFIX@@.*?@@ENDPREFIX@@|\b\d{2}:\d{3}:\d{3}\b|\b\d{5}\b)/g);
			return parts.map((part, index) => {
				if (part.startsWith('@@PREFIX@@') && part.endsWith('@@ENDPREFIX@@')) {
					const prefixText = part
						.replace('@@PREFIX@@', '')
						.replace('@@ENDPREFIX@@', '');
					return (
						<span key={index} style={{ color: styling.accentColor }}>
							{prefixText}
						</span>
					);
				}
				// Highlight Course Strings (e.g. 01:198:111)
				if (/\b\d{2}:\d{3}:\d{3}\b/.test(part)) {
					return (
						<span
							key={index}
							className='font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1 rounded mx-0.5'>
							{part}
						</span>
					);
				}
				// Highlight Index Numbers (e.g. 09214) - ensure it's not part of a larger number/string
				// The split regex \b boundaries help, but let's be careful
				if (/^\d{5}$/.test(part)) {
					return (
						<span
							key={index}
							className='font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1 rounded mx-0.5'>
							{part}
						</span>
					);
				}
				return part;
			});
		}
		if (Array.isArray(children)) {
			return children.map((child) =>
				typeof child === 'string' ? processChildren(child) : child
			);
		}
		return children;
	};

	const Wrapper = inline ? 'span' : 'div';
	const wrapperClassName = inline ? `inline ${className}` : className;

	return (
		<Wrapper className={wrapperClassName}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					p: ({ children }) =>
						inline ? (
							<span className='inline'>{processChildren(children)}</span>
						) : (
							<p>{processChildren(children)}</p>
						),
					a: ({ children, href }) => (
						<a
							href={href}
							className='text-accent underline inline'
							target='_blank'
							rel='noopener noreferrer'>
							{children}
						</a>
					),
					code: ({ children, className }) => {
						const match = /language-(\w+)/.exec(className || '');
						const isInline = !match;
						const codeString = String(children).replace(/\n$/, '');

						return isInline ? (
							<code
								className='rounded px-1 py-0.5 text-sm inline font-mono bg-surface-3 border border-border'
								style={{
									color: styling.color,
								}}>
								{children}
							</code>
						) : (
							<div
								className='relative group my-4 w-full rounded-lg border border-border bg-surface-1 font-mono'
								style={{
									backgroundColor: 'var(--surface-1)',
								}}>
								{match && (
									<div
										className='flex w-full items-center justify-between rounded-t-lg border-b border-border bg-surface-2 px-4 py-2 text-xs text-muted-foreground'
										style={{
											color: 'var(--muted-foreground)',
										}}>
										<span className=''>{match[1]}</span>
										<div className='flex items-center gap-2'>
											<button
												onClick={() => handleCopyCode(codeString)}
												className='flex items-center gap-1 rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground'>
												{copiedCode === codeString ? (
													<Check className='w-3 h-3' />
												) : (
													<Copy className='w-3 h-3' />
												)}
												<span>
													{copiedCode === codeString ? 'Copied' : 'Copy'}
												</span>
											</button>
											<button
												className='rounded px-2 py-1 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground'>
												Edit
											</button>
										</div>
									</div>
								)}
								<pre className='p-4 overflow-x-auto w-full'>
									<code
										className='text-sm whitespace-pre text-foreground'>
										{codeString}
									</code>
								</pre>
							</div>
						);
					},
					pre: ({ children }) => <>{children}</>,
					h1: ({ children }) => (
						<h1 className='text-2xl font-bold mt-4 mb-2'>
							{processChildren(children)}
						</h1>
					),
					h2: ({ children }) => (
						<h2 className='text-xl font-bold mt-3 mb-2'>
							{processChildren(children)}
						</h2>
					),
					h3: ({ children }) => (
						<h3 className='text-lg font-bold mt-2 mb-1'>
							{processChildren(children)}
						</h3>
					),
					h4: ({ children }) => (
						<h4 className='text-base font-bold mt-2 mb-1'>
							{processChildren(children)}
						</h4>
					),
					h5: ({ children }) => (
						<h5 className='text-sm font-bold mt-1 mb-1'>
							{processChildren(children)}
						</h5>
					),
					h6: ({ children }) => (
						<h6 className='text-xs font-bold mt-1 mb-1'>
							{processChildren(children)}
						</h6>
					),
					blockquote: ({ children }) => (
						<blockquote
							className='border-l-4 pl-4 my-2 italic'
							style={{ borderColor: styling.accentColor }}>
							{children}
						</blockquote>
					),
					strong: ({ children }) => (
						<strong className='font-bold inline'>
							{processChildren(children)}
						</strong>
					),
					em: ({ children }) => (
						<em className='italic inline'>{processChildren(children)}</em>
					),
					ul: ({ children }) => (
						<ul className='list-disc list-inside my-2 space-y-1'>{children}</ul>
					),
					ol: ({ children }) => (
						<ol className='list-decimal list-inside my-2 space-y-1'>
							{children}
						</ol>
					),
					li: ({ children }) => (
						<li className='ml-2'>{processChildren(children)}</li>
					),
					br: () => <br />,
					table: ({ children }) => (
						<div className='overflow-x-auto my-4'>
							<table className='min-w-full border-collapse'>{children}</table>
						</div>
					),
					thead: ({ children }) => (
						<thead
							className='border-b-2'
							style={{ borderColor: styling.accentColor }}>
							{children}
						</thead>
					),
					tbody: ({ children }) => (
						<tbody
							className='divide-y'
							style={{ borderColor: `${styling.accentColor}30` }}>
							{children}
						</tbody>
					),
					tr: ({ children }) => (
						<tr
							className='border-b'
							style={{ borderColor: `${styling.accentColor}20` }}>
							{children}
						</tr>
					),
					th: ({ children }) => (
						<th
							className='px-4 py-2 text-left font-semibold'
							style={{
								borderRight: `1px solid ${styling.accentColor}20`,
								backgroundColor: `${styling.accentColor}10`,
							}}>
							{children}
						</th>
					),
					td: ({ children }) => (
						<td
							className='px-4 py-2'
							style={{ borderRight: `1px solid ${styling.accentColor}20` }}>
							{children}
						</td>
					),
				}}>
				{content}
			</ReactMarkdown>
		</Wrapper>
	);
};

export default MarkdownRenderer;
