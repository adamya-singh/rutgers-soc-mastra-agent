import { ChatInput } from '@/cedar/components/chatInput/ChatInput';
import ChatBubbles from '@/cedar/components/chatMessages/ChatBubbles';
import Container3D from '@/cedar/components/containers/Container3D';
import { useCedarStore } from 'cedar-os';
import { X } from 'lucide-react';
import React from 'react';

interface EmbeddedCedarChatProps {
	title?: string;
	companyLogo?: React.ReactNode;
	showHeader?: boolean;
	showCloseButton?: boolean;
	onClose?: () => void;
	stream?: boolean; // Whether to use streaming for responses
	className?: string;
}

export const EmbeddedCedarChat: React.FC<EmbeddedCedarChatProps> = ({
	title = 'Cedar Chat',
	companyLogo,
	showHeader = true,
	showCloseButton = false,
	onClose,
	stream = true,
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
		<div className={`w-full h-full ${className}`}>
			<Container3D className='flex h-full w-full flex-col rounded-xl border border-border bg-surface-2 text-sm backdrop-blur-0'>
				{/* Header */}
				{showHeader && (
					<div className='z-20 flex min-w-0 flex-shrink-0 flex-row items-center justify-between border-b border-border px-5 pt-3'>
						<div className='flex items-center min-w-0 flex-1'>
							{companyLogo && (
								<div className='flex-shrink-0 w-6 h-6 mr-2'>{companyLogo}</div>
							)}
							<span className='truncate text-lg font-semibold text-foreground'>{title}</span>
						</div>
						{showCloseButton && (
							<div className='flex items-center gap-2 flex-shrink-0'>
								<button
									className='rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground'
									onClick={handleClose}
									aria-label='Close chat'>
									<X className='h-4 w-4' strokeWidth={2.5} />
								</button>
							</div>
						)}
					</div>
				)}

				{/* Chat messages - takes up remaining space */}
				<div className='flex-1 min-h-0 overflow-hidden'>
					<ChatBubbles />
				</div>

				{/* Chat input - fixed at bottom */}
				<div className='flex-shrink-0 p-3'>
					<ChatInput
						handleFocus={() => {}}
						handleBlur={() => {}}
						isInputFocused={false}
						stream={stream}
					/>
				</div>
			</Container3D>
		</div>
	);
};
