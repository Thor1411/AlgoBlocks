import React, { useState, useCallback } from "react";
import {
  Box,
  Container,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  AppBar,
  Toolbar,
  Divider,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Fade,
  Zoom,
  InputAdornment,
} from "@mui/material";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useDrag, useDrop } from "react-dnd";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { styled, alpha } from "@mui/material/styles";
import { useNavigate } from 'react-router-dom';

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Paper 
          sx={{ 
            p: 3, 
            m: 2, 
            bgcolor: "error.light",
            borderRadius: 2,
            border: "1px solid",
            borderColor: "error.main",
          }}
        >
          <Typography variant="h6" color="error" gutterBottom>
            Something went wrong
          </Typography>
          <Typography variant="body2" color="error.dark" paragraph>
            {this.state.error?.message || "An unexpected error occurred"}
          </Typography>
          <Button
            variant="contained"
            size="small"
            sx={{ mt: 1 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </Button>
        </Paper>
      );
    }
    return this.props.children;
  }
}

// Styled components
const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  transition: "all 0.2s ease-in-out",
  "&:hover": {
    boxShadow: theme.shadows[4],
  },
}));

const ModuleCard = styled(Paper)(({ theme, moduleType }) => ({
  padding: theme.spacing(2),
  marginBottom: theme.spacing(1.5),
  backgroundColor: moduleType === "AND" 
    ? alpha(theme.palette.info.light, 0.15)
    : moduleType === "OR"
    ? alpha(theme.palette.secondary.light, 0.15)
    : moduleType === "STOP_LOSS"
    ? alpha(theme.palette.error.light, 0.15)
    : moduleType === "TAKE_PROFIT"
    ? alpha(theme.palette.success.light, 0.15)
    : alpha(theme.palette.background.paper, 0.8),
  borderRadius: theme.spacing(1.5),
  border: `1px solid ${
    moduleType === "AND"
      ? theme.palette.info.light
      : moduleType === "OR"
      ? theme.palette.secondary.light
      : moduleType === "STOP_LOSS"
      ? theme.palette.error.light
      : moduleType === "TAKE_PROFIT"
      ? theme.palette.success.light
      : theme.palette.divider
  }`,
  transition: "all 0.2s ease-in-out",
  "&:hover": {
    transform: "translateY(-2px)",
    boxShadow: theme.shadows[3],
  },
}));

const DropZoneContainer = styled(Box)(({ theme, isOver, isDraggingOver }) => ({
  padding: theme.spacing(2),
  minHeight: 100,
  backgroundColor: isOver
    ? alpha(theme.palette.primary.main, 0.08)
    : alpha(theme.palette.background.default, 0.4),
  border: `2px dashed ${
    isOver
      ? theme.palette.primary.main
      : isDraggingOver
      ? theme.palette.secondary.main
      : theme.palette.divider
  }`,
  borderRadius: theme.spacing(1),
  transition: "all 0.2s ease-in-out",
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1),
  "& > *": {
    width: "100%",
  },
}));

const DraggableHandle = styled(Box)(({ theme }) => ({
  cursor: "move",
  display: "flex",
  alignItems: "center",
  color: theme.palette.text.secondary,
  "&:hover": {
    color: theme.palette.text.primary,
  },
}));

// Utility functions
const deepClone = (obj) => {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, deepClone(value)])
  );
};

const validatePercentageInput = (value, min = 0, max = 100) => {
  const numberValue = parseFloat(value);
  return !isNaN(numberValue) && numberValue >= min && numberValue <= max;
};

// DnD ItemTypes
const ItemTypes = {
  MODULE_TYPE: "MODULE_TYPE",
  INDICATOR: "INDICATOR",
  NORMAL_MODULE: "NORMAL_MODULE",
};

// DraggableModule Component
const DraggableModule = ({ item, moduleType, children }) => {
  const [{ isDragging }, drag] = useDrag({
    type:
      moduleType === "moduleType"
        ? ItemTypes.MODULE_TYPE
        : moduleType === "indicator"
        ? ItemTypes.INDICATOR
        : ItemTypes.NORMAL_MODULE,
    item: { ...item, moduleType },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <Zoom in={true} style={{ transitionDelay: '50ms' }}>
      <Box
        ref={drag}
        sx={{
          opacity: isDragging ? 0.5 : 1,
          cursor: "move",
          mb: 1,
          width: "100%",
          transition: "all 0.2s ease-in-out",
          transform: isDragging ? "scale(1.02)" : "scale(1)",
        }}
      >
        {children || (
          <StyledPaper 
            elevation={isDragging ? 4 : 1}
            sx={{
              backgroundColor: moduleType === "indicator" 
                ? "rgba(76, 175, 80, 0.08)"
                : "background.paper",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <DragIndicatorIcon color="action" fontSize="small" />
              <Typography variant="body2">{item.name}</Typography>
              {item.description && (
                <Tooltip title={item.description} arrow placement="top">
                  <InfoOutlinedIcon fontSize="small" color="action" sx={{ ml: 'auto' }} />
                </Tooltip>
              )}
            </Box>
          </StyledPaper>
        )}
      </Box>
    </Zoom>
  );
};

// DropZone Component
const DropZone = ({ onDrop, children, acceptTypes, placeholder }) => {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: acceptTypes,
    drop: (item, monitor) => {
      if (!monitor.didDrop()) {
        onDrop(item);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  });

  return (
    <DropZoneContainer 
      ref={drop} 
      isOver={isOver}
      isDraggingOver={canDrop}
      sx={{
        transform: isOver ? "scale(1.01)" : "scale(1)",
      }}
    >
      {children || (
        <Box 
          sx={{ 
            display: "flex", 
            flexDirection: "column", 
            alignItems: "center", 
            justifyContent: "center",
            minHeight: 80,
            gap: 1,
          }}
        >
          <Typography 
            variant="body2" 
            color="text.secondary"
            sx={{ 
              textAlign: "center",
              fontStyle: "italic",
            }}
          >
            {placeholder}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {isOver ? "Release to drop" : "Drag items here"}
          </Typography>
        </Box>
      )}
    </DropZoneContainer>
  );
};

// Module Types Component
const ModuleTypes = () => {
  const moduleTypes = [
    {
      type: "NORMAL",
      name: "Normal Module",
      description: "Single condition module",
      icon: "⚡",
    },
    {
      type: "AND",
      name: "AND Module",
      description: "Combines two modules with AND logic",
      icon: "&&",
    },
    {
      type: "OR",
      name: "OR Module",
      description: "Combines two modules with OR logic",
      icon: "||",
    },
    {
      type: "STOP_LOSS",
      name: "Stop Loss",
      description: "Set stop loss percentage",
      icon: "🛑",
    },
    {
      type: "TAKE_PROFIT",
      name: "Take Profit",
      description: "Set take profit percentage",
      icon: "🎯",
    },
  ];

  return moduleTypes.map((moduleType) => (
    <DraggableModule
      key={moduleType.type}
      item={moduleType}
      moduleType="moduleType"
    >
      <ModuleCard 
        elevation={2}
        moduleType={moduleType.type}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Typography 
            variant="h5" 
            sx={{ 
              width: 40, 
              height: 40, 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              borderRadius: 1,
              backgroundColor: "rgba(0,0,0,0.04)",
            }}
          >
            {moduleType.icon}
          </Typography>
          <Box>
            <Typography variant="subtitle1">{moduleType.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {moduleType.description}
            </Typography>
          </Box>
        </Box>
      </ModuleCard>
    </DraggableModule>
  ));
};

// Normal Module Component
const NormalModule = ({
  module,
  index,
  onDelete,
  onUpdate,
  availableModules,
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.NORMAL_MODULE,
    item: { ...module, type: "NORMAL", moduleIndex: index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  return (
    <Fade in={true} timeout={300}>
      <ModuleCard
        ref={drag}
        elevation={isDragging ? 4 : 1}
        sx={{
          opacity: isDragging ? 0.5 : 1,
          cursor: "move",
          position: "relative",
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <DragIndicatorIcon color="action" />
            <Typography variant="subtitle1">Module {index + 1}</Typography>
          </Box>
          <Tooltip title="Remove module" arrow>
            <IconButton 
              size="small" 
              onClick={() => onDelete(index)}
              sx={{ 
                '&:hover': { 
                  backgroundColor: 'error.light',
                  color: 'error.main',
                }
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Indicator
            </Typography>
            <DropZone
              onDrop={(item) => onUpdate(index, "indicator", item)}
              acceptTypes={[ItemTypes.INDICATOR]}
              placeholder="Drop an indicator here"
            >
              {module.indicator && (
                <StyledPaper sx={{ bgcolor: "rgba(76, 175, 80, 0.08)" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography variant="body2">{module.indicator.name}</Typography>
                    {module.indicator.params && (
                      <Tooltip 
                        title={
                          <Box>
                            <Typography variant="caption">Parameters:</Typography>
                            {Object.entries(module.indicator.params).map(([key, value]) => (
                              <Typography key={key} variant="caption" component="div">
                                {key}: {value}
                              </Typography>
                            ))}
                          </Box>
                        } 
                        arrow
                      >
                        <InfoOutlinedIcon fontSize="small" color="action" />
                      </Tooltip>
                    )}
                  </Box>
                </StyledPaper>
              )}
            </DropZone>
          </Grid>

          {module.indicator && (
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Condition
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small">
                    <Select
                      value={module.condition?.type || ""}
                      onChange={(e) =>
                        onUpdate(index, "condition", {
                          type: e.target.value,
                          name: availableModules.conditions.find(
                            (c) => c.type === e.target.value
                          )?.name,
                        })
                      }
                      displayEmpty
                      sx={{ bgcolor: "background.paper" }}
                    >
                      <MenuItem value="" disabled>
                        <Typography variant="body2" color="text.disabled">
                          Select condition
                        </Typography>
                      </MenuItem>
                      {availableModules.conditions.map((condition) => (
                        <MenuItem key={condition.type} value={condition.type}>
                          {condition.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Value"
                    value={module.conditionValue || ""}
                    onChange={(e) =>
                      onUpdate(index, "conditionValue", e.target.value)
                    }
                    sx={{ bgcolor: "background.paper" }}
                  />
                </Grid>
              </Grid>
            </Grid>
          )}

          {module.condition && (
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Action
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small">
                    <Select
                      value={module.action?.type || ""}
                      onChange={(e) =>
                        onUpdate(index, "action", {
                          type: e.target.value,
                          name: availableModules.actions.find(
                            (a) => a.type === e.target.value
                          )?.name,
                        })
                      }
                      displayEmpty
                      sx={{ bgcolor: "background.paper" }}
                    >
                      <MenuItem value="" disabled>
                        <Typography variant="body2" color="text.disabled">
                          Select action
                        </Typography>
                      </MenuItem>
                      {availableModules.actions.map((action) => (
                        <MenuItem key={action.type} value={action.type}>
                          {action.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Value"
                    value={module.actionValue || ""}
                    onChange={(e) => onUpdate(index, "actionValue", e.target.value)}
                    sx={{ bgcolor: "background.paper" }}
                  />
                </Grid>
              </Grid>
            </Grid>
          )}
        </Grid>
      </ModuleCard>
    </Fade>
  );
};

// Risk Management Module Component
const RiskManagementModule = ({
  module,
  index,
  onDelete,
  onUpdate,
  type,
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.NORMAL_MODULE,
    item: { ...module, type, moduleIndex: index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const isStopLoss = type === "STOP_LOSS";
  const maxValue = isStopLoss ? 100 : 1000;

  return (
    <Fade in={true} timeout={300}>
      <ModuleCard
        ref={drag}
        moduleType={type}
        elevation={isDragging ? 4 : 1}
        sx={{
          opacity: isDragging ? 0.5 : 1,
          cursor: "move",
          position: "relative",
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <DragIndicatorIcon color="action" />
            <Typography variant="subtitle1">
              {isStopLoss ? "Stop Loss" : "Take Profit"} Module {index + 1}
            </Typography>
          </Box>
          <Tooltip title="Remove module" arrow>
            <IconButton 
              size="small" 
              onClick={() => onDelete(index)}
              sx={{ 
                '&:hover': { 
                  backgroundColor: 'error.light',
                  color: 'error.main',
                }
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {isStopLoss ? "Stop Loss" : "Take Profit"} Value (%)
            </Typography>
            <TextField
              fullWidth
              size="small"
              type="number"
              placeholder={`0-${maxValue}`}
              value={module.value || ""}
              onChange={(e) => {
                const newValue = e.target.value;
                if (newValue === "" || 
                    (parseFloat(newValue) >= 0 && parseFloat(newValue) <= maxValue)) {
                  onUpdate(index, "value", newValue);
                }
              }}
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
                inputProps: {
                  min: 0,
                  max: maxValue,
                  step: "0.1"
                }
              }}
              error={module.value !== "" && !validatePercentageInput(module.value, 0, maxValue)}
              helperText={
                module.value !== "" && !validatePercentageInput(module.value, 0, maxValue)
                  ? `Please enter a valid percentage between 0-${maxValue}%`
                  : ""
              }
              sx={{ bgcolor: "background.paper" }}
            />
          </Grid>
        </Grid>
      </ModuleCard>
    </Fade>
  );
};

// Logic Module Component
const LogicModule = ({
  module,
  index,
  onDelete,
  onUpdate,
  availableModules,
  type,
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.NORMAL_MODULE,
    item: { ...module, type, moduleIndex: index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  // Logic Module Component (continued)
  const handleModuleDrop = (dropZone, item) => {
    try {
      if (item.moduleIndex !== undefined) {
        const droppedModule = {
          type: item.type,
          ...(item.type === "NORMAL"
            ? {
                indicator: deepClone(item.indicator),
                condition: deepClone(item.condition),
                conditionValue: item.conditionValue,
                action: deepClone(item.action),
                actionValue: item.actionValue,
              }
            : {
                module1: deepClone(item.module1),
                module2: deepClone(item.module2),
                action: deepClone(item.action),
                actionValue: item.actionValue,
              }),
        };
        onUpdate(index, dropZone, droppedModule);
      }
    } catch (error) {
      console.error("Error in handleModuleDrop:", error);
    }
  };

  const renderModuleContent = (moduleData) => {
    if (!moduleData) return null;

    try {
      const MAX_NESTING_DEPTH = 5;
      const checkNestingDepth = (module, depth = 0) => {
        if (depth >= MAX_NESTING_DEPTH) return false;
        if (!module) return true;
        if (module.type === "AND" || module.type === "OR") {
          return (
            checkNestingDepth(module.module1, depth + 1) &&
            checkNestingDepth(module.module2, depth + 1)
          );
        }
        return true;
      };

      if (!checkNestingDepth(moduleData)) {
        return (
          <Box sx={{ 
            p: 2, 
            backgroundColor: "error.light", 
            borderRadius: 1,
            border: 1,
            borderColor: "error.main"
          }}>
            <Typography variant="body2" color="error">
              Maximum nesting depth exceeded
            </Typography>
          </Box>
        );
      }

      if (typeof moduleData !== "object" || moduleData === null) {
        return null;
      }

      const getModuleColor = (type) => {
        switch (type) {
          case "AND":
            return "info";
          case "OR":
            return "secondary";
          case "STOP_LOSS":
            return "error";
          case "TAKE_PROFIT":
            return "success";
          default:
            return "default";
        }
      };

      if (moduleData.type === "AND" || moduleData.type === "OR") {
        const color = getModuleColor(moduleData.type);
        return (
          <Box
            sx={{
              p: 2,
              backgroundColor: `${color}.lighter`,
              borderRadius: 1,
              border: 1,
              borderColor: `${color}.light`,
              width: "100%",
            }}
          >
            <Typography variant="body2" gutterBottom fontWeight="medium">
              {moduleData.type} Module
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={12}>
                <Typography variant="caption" display="block">
                  Module 1: {moduleData.module1
                    ? getModuleDescription(moduleData.module1)
                    : "Empty"}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" display="block">
                  Module 2: {moduleData.module2
                    ? getModuleDescription(moduleData.module2)
                    : "Empty"}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        );
      }

      if (moduleData.type === "STOP_LOSS" || moduleData.type === "TAKE_PROFIT") {
        const color = getModuleColor(moduleData.type);
        return (
          <Box
            sx={{
              p: 2,
              backgroundColor: `${color}.lighter`,
              borderRadius: 1,
              border: 1,
              borderColor: `${color}.light`,
              width: "100%",
            }}
          >
            <Typography variant="body2" fontWeight="medium">
              {moduleData.type === "STOP_LOSS" ? "Stop Loss" : "Take Profit"}
            </Typography>
            <Typography variant="body2">
              {moduleData.value}%
            </Typography>
          </Box>
        );
      }

      return (
        <Box
          sx={{
            p: 2,
            backgroundColor: "background.paper",
            borderRadius: 1,
            border: 1,
            borderColor: "divider",
            width: "100%",
          }}
        >
          <Grid container spacing={1}>
            <Grid item xs={12}>
              <Typography variant="body2" fontWeight="medium">
                {moduleData.indicator?.name || "No Indicator"}
              </Typography>
            </Grid>
            {moduleData.condition && (
              <Grid item xs={12}>
                <Typography variant="body2">
                  {moduleData.condition.name}
                  {moduleData.conditionValue ? ` (${moduleData.conditionValue})` : ""}
                </Typography>
              </Grid>
            )}
            {moduleData.action && (
              <Grid item xs={12}>
                <Typography variant="body2">
                  {moduleData.action.name}
                  {moduleData.actionValue ? ` (${moduleData.actionValue})` : ""}
                </Typography>
              </Grid>
            )}
          </Grid>
        </Box>
      );
    } catch (error) {
      console.error("Error rendering module content:", error);
      return (
        <Box sx={{ p: 2, backgroundColor: "error.light", borderRadius: 1 }}>
          <Typography variant="body2" color="error">
            Error rendering module
          </Typography>
        </Box>
      );
    }
  };

  const getModuleDescription = (moduleData) => {
    if (!moduleData) return "Empty";
    if (moduleData.type === "STOP_LOSS") return `Stop Loss (${moduleData.value}%)`;
    if (moduleData.type === "TAKE_PROFIT") return `Take Profit (${moduleData.value}%)`;
    if (moduleData.type === "AND" || moduleData.type === "OR") {
      return `${moduleData.type} Combination`;
    }
    return `${moduleData.indicator?.name || "No Indicator"}${
      moduleData.condition?.name ? ` - ${moduleData.condition.name}` : ""
    }${moduleData.conditionValue ? ` (${moduleData.conditionValue})` : ""}`;
  };

  return (
    <Fade in={true} timeout={300}>
      <ModuleCard
        ref={drag}
        moduleType={type}
        elevation={isDragging ? 4 : 1}
        sx={{
          opacity: isDragging ? 0.5 : 1,
          cursor: "move",
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <DragIndicatorIcon color="action" />
            <Typography variant="subtitle1">
              {type} Module {index + 1}
            </Typography>
          </Box>
          <Tooltip title="Remove module" arrow>
            <IconButton 
              size="small" 
              onClick={() => onDelete(index)}
              sx={{ 
                '&:hover': { 
                  backgroundColor: 'error.light',
                  color: 'error.main',
                }
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              First Module
            </Typography>
            <DropZone
              onDrop={(item) => handleModuleDrop("module1", item)}
              acceptTypes={[ItemTypes.NORMAL_MODULE]}
              placeholder="Drop first module here"
            >
              {module.module1 && renderModuleContent(module.module1)}
            </DropZone>
          </Grid>

          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Second Module
            </Typography>
            <DropZone
              onDrop={(item) => handleModuleDrop("module2", item)}
              acceptTypes={[ItemTypes.NORMAL_MODULE]}
              placeholder="Drop second module here"
            >
              {module.module2 && renderModuleContent(module.module2)}
            </DropZone>
          </Grid>
        </Grid>

        {module.module1 && module.module2 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Combined Action
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <Select
                    value={module.action?.type || ""}
                    onChange={(e) =>
                      onUpdate(index, "action", {
                        type: e.target.value,
                        name: availableModules.actions.find(
                          (a) => a.type === e.target.value
                        )?.name,
                      })
                    }
                    displayEmpty
                    sx={{ bgcolor: "background.paper" }}
                  >
                    <MenuItem value="" disabled>
                      <Typography variant="body2" color="text.disabled">
                        Select action
                      </Typography>
                    </MenuItem>
                    {availableModules.actions.map((action) => (
                      <MenuItem key={action.type} value={action.type}>
                        {action.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Value"
                  value={module.actionValue || ""}
                  onChange={(e) => onUpdate(index, "actionValue", e.target.value)}
                  sx={{ bgcolor: "background.paper" }}
                />
              </Grid>
            </Grid>
          </Box>
        )}
      </ModuleCard>
    </Fade>
  );
};

// Strategy Builder Page Component
const StrategyBuilderPage = () => {
  const [currentDateTime] = useState("");
  const [currentUser] = useState("");
  const [strategy, setStrategy] = useState({
    name: "",
    modules: [],
  });

  // Available modules configuration
  const availableModules = {
    indicators: [
      { 
        type: "SMA", 
        name: "Simple Moving Average", 
        params: { period: 20 },
        description: "Calculates arithmetic mean of prices over specified period"
      },
      { 
        type: "EMA", 
        name: "Exponential Moving Average", 
        params: { period: 20 },
        description: "Weighted moving average with more weight to recent prices"
      },
      { 
        type: "RSI", 
        name: "Relative Strength Index", 
        params: { period: 14 },
        description: "Momentum oscillator measuring speed and change of price movements"
      },
      { 
        type: "MACD", 
        name: "MACD", 
        params: { fast: 12, slow: 26, signal: 9 },
        description: "Trend-following momentum indicator showing relationship between two moving averages"
      },
      { 
        type: "BOLLINGER", 
        name: "Bollinger Bands",
        params: { period: 20, devfactor: 2 },
        description: "Volatility bands placed above and below a moving average"
      },
    ],
    conditions: [
      { type: "CROSSOVER", name: "Crossover", description: "When one line crosses another" },
      { type: "GREATER_THAN", name: "Greater Than", description: "When value exceeds threshold" },
      { type: "LESS_THAN", name: "Less Than", description: "When value falls below threshold" },
      { type: "EQUAL", name: "Equal To", description: "When value matches threshold" },
    ],
    actions: [
      { type: "BUY", name: "Buy", description: "Open a long position" },
      { type: "SELL", name: "Sell", description: "Open a short position" },
      { type: "CLOSE", name: "Close Position", description: "Exit current position" }
    ],
  };

  const handleModuleDrop = useCallback((item) => {
    if (item.moduleType === "moduleType") {
      setStrategy((prev) => ({
        ...prev,
        modules: [
          ...prev.modules,
          {
            type: item.type,
            ...(item.type === "NORMAL"
              ? {
                  indicator: null,
                  condition: null,
                  conditionValue: "",
                  action: null,
                  actionValue: "",
                }
              : item.type === "STOP_LOSS" || item.type === "TAKE_PROFIT"
              ? {
                  value: "",
                }
              : {
                  module1: null,
                  module2: null,
                  action: null,
                  actionValue: "",
                }),
          },
        ],
      }));
    }
  }, []);

  const handleDeleteModule = useCallback((index) => {
    setStrategy((prev) => ({
      ...prev,
      modules: prev.modules.filter((_, i) => i !== index),
    }));
  }, []);

  const handleUpdateModule = useCallback((index, field, value) => {
    setStrategy((prev) => {
      const newModules = [...prev.modules];
      newModules[index] = {
        ...newModules[index],
        [field]: value,
      };
      return {
        ...prev,
        modules: newModules,
      };
    });
  }, []);

  const validateStrategy = useCallback(() => {
    if (!strategy.name.trim()) {
      throw new Error("Please enter a strategy name");
    }

    if (strategy.modules.length === 0) {
      throw new Error("Please add at least one module to your strategy");
    }

    const validateModule = (module) => {
      if (module.type === "NORMAL") {
        if (!module.indicator || !module.condition || !module.action) {
          return false;
        }
        return true;
      } else if (module.type === "STOP_LOSS") {
        return validatePercentageInput(module.value, 0, 100);
      } else if (module.type === "TAKE_PROFIT") {
        return validatePercentageInput(module.value, 0, 1000);
      } else {
        if (!module.module1 || !module.module2 || !module.action) {
          return false;
        }
        return true;
      }
    };

    const invalidModules = strategy.modules.filter(module => !validateModule(module));

    if (invalidModules.length > 0) {
      throw new Error("Please complete all modules and ensure valid values");
    }
  }, [strategy]);

  const transformStrategyToJson = () => {
    const usedIndicators = new Set();
    strategy.modules.forEach(module => {
      if (module.type === "NORMAL" && module.indicator) {
        const indicatorName = `${module.indicator.type.toLowerCase()}${module.indicator.params.period || ""}`;
        usedIndicators.add(JSON.stringify({
          name: indicatorName,
          type: module.indicator.type,
          params: module.indicator.params
        }));
      }
    });
  
    const rules = strategy.modules.map(module => {
      if (module.type === "STOP_LOSS" || module.type === "TAKE_PROFIT") {
        return {
          type: module.type.toLowerCase(),
          value: parseFloat(module.value)
        };
      } else if (module.type === "NORMAL") {
        return {
          condition: {
            operator: module.condition?.type === "GREATER_THAN" ? ">" :
                     module.condition?.type === "LESS_THAN" ? "<" :
                     module.condition?.type,
            left: module.condition?.left || { indicator: `${module.indicator?.type.toLowerCase()}${module.indicator?.params.period}` },
            right: { value: parseFloat(module.conditionValue) || 0 }
          },
          action: {
            type: module.action?.type.toLowerCase(),
            value: parseInt(module.actionValue) || 10
          }
        };
      } else {
        return {
          condition: {
            operator: module.type.toLowerCase(),
            conditions: [
              {
                operator: module.module1?.condition?.type === "GREATER_THAN" ? ">" :
                         module.module1?.condition?.type === "LESS_THAN" ? "<" :
                         module.module1?.condition?.type,
                left: { price: "close" },
                right: { indicator: `${module.module1?.indicator?.type.toLowerCase()}${module.module1?.indicator?.params.period}` }
              },
              {
                operator: module.module2?.condition?.type === "GREATER_THAN" ? ">" :
                         module.module2?.condition?.type === "LESS_THAN" ? "<" :
                         module.module2?.condition?.type,
                left: { indicator: `${module.module2?.indicator?.type.toLowerCase()}${module.module2?.indicator?.params.period}` },
                right: { value: parseFloat(module.module2?.conditionValue) || 0 }
              }
            ]
          },
          action: {
            type: module.action?.type.toLowerCase(),
            value: parseInt(module.actionValue) || 10
          }
        };
      }
    }).filter(rule => rule.type || rule.condition?.operator);
  
    return {
      name: strategy.name || "Unnamed_Strategy",
      parameters: {},
      indicators: Array.from(usedIndicators).map(ind => JSON.parse(ind)),
      rules,
      riskManagement: {
        stopLoss: strategy.modules.find(m => m.type === "STOP_LOSS")?.value,
        takeProfit: strategy.modules.find(m => m.type === "TAKE_PROFIT")?.value
      }
    };
  };

  const saveStrategyToFile = () => {
    try {
      validateStrategy();
      const transformedData = transformStrategyToJson();
      const jsonString = JSON.stringify(transformedData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${strategy.name || "strategy"}.json`;
      link.click();
      URL.revokeObjectURL(url);
      console.log("Strategy saved successfully!");
      alert("Strategy saved successfully!");
    } catch (error) {
      console.error("Error saving strategy:", error);
      alert(error.message || "Failed to save strategy. Check the console for details.");
    }
  };

  const handleStrategySubmit = useCallback(() => {
    navigate('/testing', {
      state: {
        stock: selectedStock,
        strategy: strategyFile.content,
        startDate,
        endDate,
      }
    });
  }, [strategy, currentDateTime, currentUser, validateStrategy]);

  return (
    <DndProvider backend={HTML5Backend}>
      <ErrorBoundary>
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            width: "100%",
            bgcolor: "background.default",
          }}
        >
          <AppBar
            position="static"
            elevation={0}
            sx={{
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <Toolbar variant="dense">
              <Typography
                variant="h6"
                component="div"
                sx={{
                  flexGrow: 1,
                  color: "text.primary",
                  fontWeight: 600,
                }}
              >
                Trading Strategy Builder
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mr: 2,
                  color: "text.secondary",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Box component="span" sx={{ color: "primary.main" }}>
                  {currentDateTime}
                </Box>
                
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  color: "text.secondary",
                }}
              >
              
                <Box component="span" sx={{ color: "primary.main" }}>
                  {currentUser}
                </Box>
              </Typography>
            </Toolbar>
          </AppBar>

          <Box
            sx={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              height: "calc(100vh - 48px)",
              overflow: "hidden",
            }}
          >
            <Container
              maxWidth={false}
              sx={{
                py: 2,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                px: 2,
              }}
            >
              <Paper
                sx={{
                  p: 2,
                  mb: 2,
                  flexShrink: 0,
                  borderRadius: 2,
                  border: 1,
                  borderColor: "divider",
                }}
              >
                <TextField
                  fullWidth
                  size="small"
                  label="Strategy Name"
                  variant="outlined"
                  value={strategy.name}
                  onChange={(e) =>
                    setStrategy({ ...strategy, name: e.target.value })
                  }
                  InputProps={{
                    sx: { borderRadius: 1.5 },
                  }}
                />
              </Paper>

              <Grid
                container
                spacing={2}
                sx={{
                  flexGrow: 1,
                  minHeight: 0,
                  width: "100%",
                  margin: 0,
                }}
              >
                <Grid item xs={3} sx={{ height: "100%", paddingLeft: 0 }}>
                  <Paper
                    sx={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      borderRadius: 2,
                      border: 1,
                      borderColor: "divider",
                      overflow: "hidden",
                    }}
                  >
                    <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Building Blocks
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        flexGrow: 1,
                        overflowY: "auto",
                        "&::-webkit-scrollbar": {
                          width: "8px",
                        },
                        "&::-webkit-scrollbar-track": {
                          backgroundColor: "transparent",
                        },
                        "&::-webkit-scrollbar-thumb": {
                          backgroundColor: "rgba(0,0,0,0.1)",
                          borderRadius: "4px",
                        },
                      }}
                    >
                      <Box sx={{ p: 2 }}>
                        <Typography 
                          variant="subtitle2" 
                          sx={{ 
                            fontWeight: 600,
                            mb: 1
                          }}
                        >
                          Module Types
                        </Typography>
                        <ModuleTypes />
                      </Box>

                      <Divider sx={{ mx: 2 }} />

                      <Box sx={{ p: 2 }}>
                        <Typography 
                          variant="subtitle2" 
                          sx={{ 
                            fontWeight: 600,
                            mb: 1
                          }}
                        >
                          Indicators
                        </Typography>
                        {availableModules.indicators.map((indicator) => (
                          <DraggableModule
                            key={indicator.type}
                            item={indicator}
                            moduleType="indicator"
                          />
                        ))}
                      </Box>
                    </Box>
                  </Paper>
                </Grid>

                <Grid item xs={9} sx={{ height: "100%", paddingRight: 0 }}>
                  <Paper
                    sx={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      borderRadius: 2,
                      border: 1,
                      borderColor: "divider",
                      overflow: "hidden",
                    }}
                  >
                    <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Strategy Modules
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        flexGrow: 1,
                        overflowY: "auto",
                        p: 2,
                        "&::-webkit-scrollbar": {
                          width: "8px",
                        },
                        "&::-webkit-scrollbar-track": {
                          backgroundColor: "transparent",
                        },
                        "&::-webkit-scrollbar-thumb": {
                          backgroundColor: "rgba(0,0,0,0.1)",
                          borderRadius: "4px",
                        },
                      }}
                      >
                        <DropZone
                          onDrop={handleModuleDrop}
                          acceptTypes={[ItemTypes.MODULE_TYPE]}
                          placeholder="Drag a module type here to start building your strategy"
                        >
                          {strategy.modules.map((module, index) => {
                            if (module.type === "STOP_LOSS" || module.type === "TAKE_PROFIT") {
                              return (
                                <RiskManagementModule
                                  key={index}
                                  module={module}
                                  index={index}
                                  onDelete={handleDeleteModule}
                                  onUpdate={handleUpdateModule}
                                  type={module.type}
                                />
                              );
                            } else if (module.type === "NORMAL") {
                              return (
                                <NormalModule
                                  key={index}
                                  module={module}
                                  index={index}
                                  onDelete={handleDeleteModule}
                                  onUpdate={handleUpdateModule}
                                  availableModules={availableModules}
                                />
                              );
                            } else {
                              return (
                                <LogicModule
                                  key={index}
                                  module={module}
                                  index={index}
                                  onDelete={handleDeleteModule}
                                  onUpdate={handleUpdateModule}
                                  availableModules={availableModules}
                                  type={module.type}
                                />
                              );
                            }
                          })}
                        </DropZone>
                      </Box>
  
                      <Box
                        sx={{
                          p: 2,
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 2,
                          borderTop: 1,
                          borderColor: "divider",
                        }}
                      >
                        <Button
                          variant="contained"
                          startIcon={<SaveIcon />}
                          onClick={saveStrategyToFile}
                          sx={{
                            borderRadius: 2,
                            textTransform: "none",
                            px: 3,
                          }}
                        >
                          Save Strategy
                        </Button>
                        <Button
                          variant="contained"
                          color="secondary"
                          startIcon={<PlayArrowIcon />}
                          onClick={handleStrategySubmit}
                          sx={{
                            borderRadius: 2,
                            textTransform: "none",
                            px: 3,
                          }}
                        >
                          Run Backtest
                        </Button>
                      </Box>
                    </Paper>
                  </Grid>
                </Grid>
              </Container>
            </Box>
          </Box>
        </ErrorBoundary>
      </DndProvider>
    );
  };
  
  export default StrategyBuilderPage;