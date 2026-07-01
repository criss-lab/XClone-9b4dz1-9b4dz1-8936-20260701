import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { BarChart3, Users, Clock } from 'lucide-react';

interface PollOption {
  id: string;
  option_text: string;
  votes: number;
}

interface Poll {
  id: string;
  question: string;
  expires_at: string;
  total_votes: number;
  options: PollOption[];
}

interface PollCardProps {
  poll: Poll;
  postId: string;
}

export function PollCard({ poll, postId }: PollCardProps) {
  const { user } = useAuth();
  const [voted, setVoted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [pollData, setPollData] = useState(poll);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkIfVoted();
  }, [poll.id, user]);

  const checkIfVoted = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('poll_votes')
      .select('option_id')
      .eq('poll_id', poll.id)
      .eq('user_id', user.id)
      .single();

    if (data) {
      setVoted(true);
      setSelectedOption(data.option_id);
    }
  };

  const handleVote = async (optionId: string) => {
    if (!user) {
      toast.error('Please log in to vote');
      return;
    }

    if (voted) {
      toast.error('You have already voted in this poll');
      return;
    }

    const now = new Date();
    const expiresAt = new Date(poll.expires_at);
    if (now > expiresAt) {
      toast.error('This poll has ended');
      return;
    }

    setLoading(true);

    try {
      // Insert vote
      const { error: voteError } = await supabase
        .from('poll_votes')
        .insert({
          poll_id: poll.id,
          option_id: optionId,
          user_id: user.id
        });

      if (voteError) throw voteError;

      // Update option votes
      const option = pollData.options.find(o => o.id === optionId);
      if (option) {
        const { error: optionError } = await supabase
          .from('poll_options')
          .update({ votes: option.votes + 1 })
          .eq('id', optionId);

        if (optionError) throw optionError;
      }

      // Update total votes
      const { error: pollError } = await supabase
        .from('polls')
        .update({ total_votes: pollData.total_votes + 1 })
        .eq('id', poll.id);

      if (pollError) throw pollError;

      // Refresh poll data
      const { data: updatedPoll } = await supabase
        .from('polls')
        .select(`
          *,
          options:poll_options(*)
        `)
        .eq('id', poll.id)
        .single();

      if (updatedPoll) {
        setPollData(updatedPoll as Poll);
      }

      setVoted(true);
      setSelectedOption(optionId);
      toast.success('Vote recorded!');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getPercentage = (votes: number) => {
    if (pollData.total_votes === 0) return 0;
    return Math.round((votes / pollData.total_votes) * 100);
  };

  const isExpired = new Date() > new Date(poll.expires_at);
  const timeLeft = Math.max(0, new Date(poll.expires_at).getTime() - Date.now());
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const daysLeft = Math.floor(hoursLeft / 24);

  return (
    <div className="border-2 border-primary/20 rounded-2xl p-5 mt-3 bg-gradient-to-br from-primary/5 to-purple-500/5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-primary/10 rounded-full">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <h3 className="font-bold text-lg flex-1">{poll.question}</h3>
      </div>
      
      <div className="space-y-3">
        {pollData.options.map((option) => {
          const percentage = getPercentage(option.votes);
          const isSelected = selectedOption === option.id;
          const isLeading = voted && option.votes === Math.max(...pollData.options.map(o => o.votes));

          return (
            <button
              key={option.id}
              onClick={() => !voted && !isExpired && handleVote(option.id)}
              disabled={voted || isExpired || loading}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                voted || isExpired
                  ? 'cursor-default'
                  : 'cursor-pointer hover:bg-muted/50 hover:border-primary/40'
              } ${
                isSelected
                  ? 'border-primary bg-primary/10 shadow-lg'
                  : isLeading && voted
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`font-semibold ${isSelected ? 'text-primary' : ''}`}>
                  {option.option_text}
                </span>
                {(voted || isExpired) && (
                  <div className="flex items-center gap-2">
                    {isLeading && voted && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full font-bold">
                        Leading
                      </span>
                    )}
                    <span className="text-lg font-bold text-primary">{percentage}%</span>
                  </div>
                )}
              </div>
              
              {(voted || isExpired) && (
                <div className="relative w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isSelected || isLeading
                        ? 'bg-gradient-to-r from-primary to-purple-500'
                        : 'bg-primary/40'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              )}
              
              {(voted || isExpired) && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {option.votes.toLocaleString()} vote{option.votes !== 1 ? 's' : ''}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm">
        <div className="flex items-center gap-4 text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span className="font-medium">{pollData.total_votes.toLocaleString()}</span>
            <span>vote{pollData.total_votes !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {isExpired ? (
              <span className="text-red-500 font-medium">Poll ended</span>
            ) : daysLeft > 0 ? (
              <span>{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</span>
            ) : hoursLeft > 0 ? (
              <span>{hoursLeft} hour{hoursLeft !== 1 ? 's' : ''} left</span>
            ) : (
              <span className="text-orange-500 font-medium">Ending soon</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
