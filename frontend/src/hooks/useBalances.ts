import { useReadContract, useBalance, useAccount } from 'wagmi';
import { ERC20_ABI } from '@/lib/abis';
import { CONTRACTS } from '@/lib/web3';
import type { Address } from 'viem';

export function useBalances() {
  const { address, isConnected } = useAccount();

  const { data: tusdcRaw } = useReadContract({
    address: CONTRACTS.tUSDC as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: stt } = useBalance({
    address,
    query: { enabled: !!address },
  });

  return {
    isConnected,
    tusdc: tusdcRaw ? Number(tusdcRaw) / 1e6 : 0,
    stt: stt ? Number(stt.value) / 1e18 : 0,
    isLoading: !!address && (tusdcRaw === undefined || stt === undefined),
  };
}
