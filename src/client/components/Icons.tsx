import React from 'react';
import {
  MdDashboard,
  MdPeople,
  MdGroups,
  MdLanguage,
  MdEmail,
  MdPhone,
  MdBarChart,
  MdTrendingUp,
  MdPersonAdd,
  MdGroup,
  MdStar,
  MdSportsKabaddi,
  MdSportsMartialArts,
  MdFitnessCenter,
  MdLogout,
  MdMenu,
  MdClose,
  MdAdd,
  MdEdit,
  MdDelete,
  MdCheck,
  MdArrowBack,
  MdArrowForward,
  MdSettings,
  MdFilterList,
  MdSearch,
  MdInfo,
  MdWarning,
  MdError,
  MdCheckCircle,
  MdCalendarToday,
  MdLocationOn,
  MdAttachMoney,
  MdWork,
  MdShare,
  MdViewModule,
  MdViewList,
} from 'react-icons/md';

interface IconProps {
  size?: number;
  className?: string;
  color?: string;
}

export const DashboardIcon: React.FC<IconProps> = (props) => <MdDashboard {...props} />;
export const MembersIcon: React.FC<IconProps> = (props) => <MdPeople {...props} />;
export const AudiencesIcon: React.FC<IconProps> = (props) => <MdGroups {...props} />;
export const OptimizeIcon: React.FC<IconProps> = (props) => <MdLanguage {...props} />;
export const EngageIcon: React.FC<IconProps> = (props) => <MdEmail {...props} />;
export const OutreachIcon: React.FC<IconProps> = (props) => <MdPhone {...props} />;
export const StatsIcon: React.FC<IconProps> = (props) => <MdBarChart {...props} />;
export const TrendIcon: React.FC<IconProps> = (props) => <MdTrendingUp {...props} />;
export const AddPersonIcon: React.FC<IconProps> = (props) => <MdPersonAdd {...props} />;
export const GroupIcon: React.FC<IconProps> = (props) => <MdGroup {...props} />;
export const StarIcon: React.FC<IconProps> = (props) => <MdStar {...props} />;
export const BJJIcon: React.FC<IconProps> = (props) => <MdSportsKabaddi {...props} />;
export const MuayThaiIcon: React.FC<IconProps> = (props) => <MdSportsMartialArts {...props} />;
export const TaekwondoIcon: React.FC<IconProps> = (props) => (
  <MdSportsMartialArts {...props} style={{ transform: 'scaleX(-1)' }} />
);
export const LogoutIcon: React.FC<IconProps> = (props) => <MdLogout {...props} />;
export const MenuIcon: React.FC<IconProps> = (props) => <MdMenu {...props} />;
export const CloseIcon: React.FC<IconProps> = (props) => <MdClose {...props} />;
export const AddIcon: React.FC<IconProps> = (props) => <MdAdd {...props} />;
export const EditIcon: React.FC<IconProps> = (props) => <MdEdit {...props} />;
export const DeleteIcon: React.FC<IconProps> = (props) => <MdDelete {...props} />;
export const CheckIcon: React.FC<IconProps> = (props) => <MdCheck {...props} />;
export const BackIcon: React.FC<IconProps> = (props) => <MdArrowBack {...props} />;
export const ForwardIcon: React.FC<IconProps> = (props) => <MdArrowForward {...props} />;
export const SettingsIcon: React.FC<IconProps> = (props) => <MdSettings {...props} />;
export const FilterIcon: React.FC<IconProps> = (props) => <MdFilterList {...props} />;
export const SearchIcon: React.FC<IconProps> = (props) => <MdSearch {...props} />;
export const InfoIcon: React.FC<IconProps> = (props) => <MdInfo {...props} />;
export const WarningIcon: React.FC<IconProps> = (props) => <MdWarning {...props} />;
export const ErrorIcon: React.FC<IconProps> = (props) => <MdError {...props} />;
export const SuccessIcon: React.FC<IconProps> = (props) => <MdCheckCircle {...props} />;
export const CalendarIcon: React.FC<IconProps> = (props) => <MdCalendarToday {...props} />;
export const LocationIcon: React.FC<IconProps> = (props) => <MdLocationOn {...props} />;
export const DollarIcon: React.FC<IconProps> = (props) => <MdAttachMoney {...props} />;
export const BillingIcon: React.FC<IconProps> = (props) => <MdAttachMoney {...props} />;
export const UsersIcon: React.FC<IconProps> = (props) => <MdPeople {...props} />;
export const WorkforceIcon: React.FC<IconProps> = (props) => <MdWork {...props} />;
export const SocialIcon: React.FC<IconProps> = (props) => <MdShare {...props} />;
export const AnalyticsIcon: React.FC<IconProps> = (props) => <MdTrendingUp {...props} />;
export const CardViewIcon: React.FC<IconProps> = (props) => <MdViewModule {...props} />;
export const TableViewIcon: React.FC<IconProps> = (props) => <MdViewList {...props} />;

// Dojo/Martial Arts Logo
export const DojoIcon: React.FC<IconProps> = (props) => (
  <MdSportsMartialArts {...props} />
);
