import { SocVercelChat } from '@/cedar/components/vercelChat/SocVercelChat';
import { useCedarStore } from 'cedar-os';
import { X } from 'lucide-react';
import React from 'react';

interface EmbeddedCedarChatProps {
	title?: string;
	companyLogo?: React.ReactNode;
	showHeader?: boolean;
	showCloseButton?: boolean;
	onClose?: () => void;
	stream?: boolean;
	className?: string;
}

export const EmbeddedCedarChat: React.FC<EmbeddedCedarChatProps> = ({
	title = 'Cedar Chat',
	companyLogo,
	showHeader = true,
	showCloseButton = false,
	onClose,
	className = '',
}) => {
	const setShowChat = useCedarStore((state) => state.setShowChat);

	const handleClose = () => {
		if (onClose) {
			onClose();
		} else {
			setShowChat(false);
		}
	};

	return (
		<div className={`h-full min-h-0 w-full overflow-hidden ${className}`}>
			<div className='flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-1 text-sm shadow-elev-1'>
				{showHeader && (
					<div className='z-20 flex min-w-0 flex-shrink-0 flex-row items-center justify-between border-b border-border-subtle px-4 py-2.5'>
						<div className='flex min-w-0 flex-1 items-center'>
							{companyLogo && (
								<div className='mr-2 h-5 w-5 flex-shrink-0'>{companyLogo}</div>
							)}
							<span className='truncate text-sm font-medium text-foreground'>
								{title}
							</span>
						</div>
						{showCloseButton && (
							<div className='flex flex-shrink-0 items-center gap-2'>
								<button
									className='rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground'
									onClick={handleClose}
									aria-label='Close chat'>
									<X className='h-4 w-4' strokeWidth={2.5} />
								</button>
							</div>
						)}
					</div>
				)}

				<SocVercelChat />
			</div>
		</div>
	);
};
